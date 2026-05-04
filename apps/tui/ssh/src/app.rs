use std::io::{self, Write};
use std::sync::mpsc;
use std::time::Duration;

use ratatui::{backend::CrosstermBackend, layout::Rect, Terminal, TerminalOptions, Viewport};
use tui_core::{App, InputEvent};

pub fn parse_input(bytes: &[u8]) -> Vec<InputEvent> {
    let mut events = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'q' | b'Q' | 3 => events.push(InputEvent::Quit),
            b'j' => events.push(InputEvent::Down),
            b'k' => events.push(InputEvent::Up),
            b'\r' | b'\n' => events.push(InputEvent::Enter),
            0x1b => {
                if i + 2 < bytes.len() && bytes[i + 1] == b'[' {
                    match bytes[i + 2] {
                        b'A' => { events.push(InputEvent::Up); i += 2; }
                        b'B' => { events.push(InputEvent::Down); i += 2; }
                        _ => {}
                    }
                } else {
                    events.push(InputEvent::Back);
                }
            }
            _ => {}
        }
        i += 1;
    }
    events
}

pub fn run_tui<W: Write>(
    writer: W,
    input_rx: mpsc::Receiver<Vec<u8>>,
    cols: u16,
    rows: u16,
) -> io::Result<()> {
    let backend = CrosstermBackend::new(writer);
    let mut terminal = Terminal::with_options(
        backend,
        TerminalOptions {
            viewport: Viewport::Fixed(Rect::new(0, 0, cols, rows)),
        },
    )?;

    write!(terminal.backend_mut(), "\x1b[?1049h\x1b[2J\x1b[H")?;
    terminal.backend_mut().flush()?;

    let mut app = App::new();
    terminal.draw(|f| app.render(f))?;

    loop {
        match input_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(bytes) => {
                for event in parse_input(&bytes) {
                    if app.handle_input(event) {
                        write!(terminal.backend_mut(), "\x1b[?1049l")?;
                        terminal.backend_mut().flush()?;
                        return Ok(());
                    }
                }
                terminal.draw(|f| app.render(f))?;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
        }
    }
}
