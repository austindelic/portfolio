mod app;
mod handler;

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use russh::server;
use russh_keys::key::KeyPair;
use tokio::net::TcpListener;

const PORT: u16 = 22;
const HOST_KEY_PATH: &str = "/etc/tui/host_key";

fn load_or_generate_key() -> anyhow::Result<KeyPair> {
    let path = Path::new(HOST_KEY_PATH);
    if path.exists() {
        let pem = std::fs::read_to_string(path)?;
        Ok(russh_keys::decode_secret_key(&pem, None)?)
    } else {
        let key = KeyPair::generate_ed25519();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file = std::fs::File::create(path)?;
        russh_keys::encode_pkcs8_pem(&key, file)?;
        Ok(key)
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let key = load_or_generate_key()?;

    let config = Arc::new(server::Config {
        inactivity_timeout: Some(Duration::from_secs(3600)),
        auth_rejection_time: Duration::from_secs(1),
        auth_rejection_time_initial: None,
        keys: vec![key],
        ..Default::default()
    });

    let listener = TcpListener::bind(("0.0.0.0", PORT)).await?;
    println!("SSH portfolio listening on 0.0.0.0:{PORT}");

    loop {
        let (stream, addr) = listener.accept().await?;
        let config = Arc::clone(&config);
        tokio::spawn(async move {
            let session_handler = handler::SessionHandler::new();
            if let Err(e) = server::run_stream(config, stream, session_handler).await {
                eprintln!("Session error from {addr}: {e}");
            }
        });
    }
}
