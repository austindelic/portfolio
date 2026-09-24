//! Cross-platform terminal acceptance test, including ConPTY on Windows.
//! Usage: pty-smoke PROGRAM [ARGS...]; PROGRAM can be Node + the packed launcher.
use anyhow::{Context, Result, bail, ensure};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use std::{
    io::{Read, Write},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

fn wait_for(
    output: &Arc<Mutex<Vec<u8>>>,
    needle: &str,
    child: &mut dyn portable_pty::Child,
) -> Result<()> {
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(15) {
        if String::from_utf8_lossy(&output.lock().unwrap()).contains(needle) {
            return Ok(());
        }
        if let Some(status) = child.try_wait()? {
            bail!(
                "Process exited with {status} while waiting for {needle:?}: {}",
                String::from_utf8_lossy(&output.lock().unwrap())
            );
        }
        std::thread::sleep(Duration::from_millis(30));
    }
    bail!(
        "Missing {needle:?}: {}",
        String::from_utf8_lossy(&output.lock().unwrap())
    );
}
fn main() -> Result<()> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    ensure!(!args.is_empty(), "Supply a program and optional arguments");
    for quit in [b'q', 3] {
        let pair = native_pty_system().openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        let mut cmd = CommandBuilder::new(&args[0]);
        cmd.cwd(std::env::current_dir()?);
        cmd.args(&args[1..]);
        cmd.args(["--renderer", "static"]);
        cmd.env("TERM", "xterm-256color");
        let mut reader = pair.master.try_clone_reader()?;
        let writer = Arc::new(Mutex::new(pair.master.take_writer()?));
        let output = Arc::new(Mutex::new(Vec::<u8>::new()));
        let capture = output.clone();
        let replies = writer.clone();
        std::thread::spawn(move || {
            let mut bytes = [0; 8192];
            let mut query = [0; 4];
            while let Ok(n) = reader.read(&mut bytes) {
                if n == 0 {
                    break;
                }
                // ConPTY inherits the cursor and can block startup/teardown
                // until its terminal host answers this (possibly split) query.
                for byte in &bytes[..n] {
                    query.rotate_left(1);
                    query[3] = *byte;
                    if query == *b"\x1b[6n" {
                        let mut writer = replies.lock().unwrap();
                        let _ = writer.write_all(b"\x1b[1;1R");
                        let _ = writer.flush();
                    }
                }
                let mut out = capture.lock().unwrap();
                if out.len() + n > 1_000_000 {
                    out.clear();
                }
                out.extend_from_slice(&bytes[..n]);
            }
        });
        let mut child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);
        let send = |bytes: &[u8]| -> std::io::Result<()> {
            let mut writer = writer.lock().unwrap();
            writer.write_all(bytes)?;
            writer.flush()
        };
        let result = (|| -> Result<()> {
            wait_for(&output, "Austin", child.as_mut())?;
            println!("Initial screen received");
            output.lock().unwrap().clear();
            send(b"\x1b[C\r")?;
            wait_for(&output, "Blog posts", child.as_mut())?;
            pair.master.resize(PtySize {
                rows: 40,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })?;
            output.lock().unwrap().clear();
            send(b"?")?;
            wait_for(&output, "Tab", child.as_mut())?;
            send(&[quit])?;
            let deadline = Instant::now() + Duration::from_secs(8);
            loop {
                if let Some(status) = child.try_wait()? {
                    ensure!(status.success(), "Application exited with {status}");
                    break;
                }
                ensure!(Instant::now() < deadline, "Application did not exit");
                std::thread::sleep(Duration::from_millis(30));
            }
            Ok(())
        })();
        if result.is_err() {
            let _ = child.kill();
            let _ = child.wait();
        }
        result.context("Packed CLI terminal smoke test")?;
        println!("PASS: navigation, help, resize and exit ({quit})");
    }
    Ok(())
}
