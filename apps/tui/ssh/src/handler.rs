use std::sync::mpsc;

use anyhow::Result;
use async_trait::async_trait;
use russh::{
    server::{Auth, Handler, Msg, Session},
    Channel, ChannelId, CryptoVec,
};

use crate::app;

pub struct SessionHandler {
    cols: u16,
    rows: u16,
    channel_id: Option<ChannelId>,
    // Sends raw SSH input bytes into the TUI thread.
    input_tx: Option<mpsc::SyncSender<Vec<u8>>>,
}

impl SessionHandler {
    pub fn new() -> Self {
        Self {
            cols: 220,
            rows: 50,
            channel_id: None,
            input_tx: None,
        }
    }

    // Spawns the TUI on a blocking thread and a tokio task to drain its output back to SSH.
    fn start_tui(&mut self, channel_id: ChannelId, handle: russh::server::Handle) {
        let cols = self.cols;
        let rows = self.rows;

        let (input_tx, input_rx) = mpsc::sync_channel::<Vec<u8>>(64);
        self.input_tx = Some(input_tx);

        // Async task: drain rendered ANSI bytes → SSH channel write.
        let (output_tx, mut output_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
        tokio::spawn(async move {
            while let Some(data) = output_rx.recv().await {
                if handle
                    .data(channel_id, CryptoVec::from(data))
                    .await
                    .is_err()
                {
                    break;
                }
            }
        });

        // Blocking thread: run ratatui event loop.
        std::thread::spawn(move || {
            let writer = SshWriter {
                tx: output_tx,
                buf: Vec::new(),
            };
            if let Err(e) = app::run_tui(writer, input_rx, cols, rows) {
                eprintln!("TUI error: {e}");
            }
        });
    }
}

// Buffers writes and flushes them as chunks to the async SSH sender.
struct SshWriter {
    tx: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
    buf: Vec<u8>,
}

impl std::io::Write for SshWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buf.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        let data = std::mem::take(&mut self.buf);
        if !data.is_empty() {
            self.tx.send(data).ok();
        }
        Ok(())
    }
}

#[async_trait]
impl Handler for SessionHandler {
    type Error = anyhow::Error;

    async fn auth_none(&mut self, _user: &str) -> Result<Auth> {
        Ok(Auth::Accept)
    }

    async fn auth_password(&mut self, _user: &str, _password: &str) -> Result<Auth> {
        Ok(Auth::Accept)
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        _session: &mut Session,
    ) -> Result<bool> {
        self.channel_id = Some(channel.id());
        Ok(true)
    }

    async fn pty_request(
        &mut self,
        _channel: ChannelId,
        _term: &str,
        col_width: u32,
        row_height: u32,
        _pix_width: u32,
        _pix_height: u32,
        _modes: &[(russh::Pty, u32)],
        _session: &mut Session,
    ) -> Result<()> {
        self.cols = col_width as u16;
        self.rows = row_height as u16;
        Ok(())
    }

    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> Result<()> {
        self.start_tui(channel, session.handle());
        Ok(())
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        data: &[u8],
        _session: &mut Session,
    ) -> Result<()> {
        if let Some(tx) = &self.input_tx {
            tx.send(data.to_vec()).ok();
        }
        Ok(())
    }

    async fn window_change_request(
        &mut self,
        _channel: ChannelId,
        col_width: u32,
        row_height: u32,
        _pix_width: u32,
        _pix_height: u32,
        _session: &mut Session,
    ) -> Result<()> {
        self.cols = col_width as u16;
        self.rows = row_height as u16;
        Ok(())
    }
}
