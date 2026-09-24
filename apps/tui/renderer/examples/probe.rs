use std::time::{Duration, Instant};
use tui_renderer::{Renderer, Request};
fn main() -> anyhow::Result<()> {
    let start = Instant::now();
    let mut gpu = Renderer::new()?;
    eprintln!("Adapter: {}; init {:?}", gpu.adapter, start.elapsed());
    let request = Request::default();
    let mut count = 0;
    let start = Instant::now();
    let mut latest = None;
    while start.elapsed() < Duration::from_secs(12) {
        let mut r = request.clone();
        r.time = start.elapsed().as_secs_f32() * 2.;
        gpu.submit(r)?;
        if let Some(frame) = gpu.poll()? {
            count += 1;
            latest = Some(frame);
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    let frame = latest.ok_or_else(|| anyhow::anyhow!("No GPU frames completed"))?;
    eprintln!(
        "Frames: {count}; FPS: {:.2}",
        count as f64 / start.elapsed().as_secs_f64()
    );
    for row in frame.cells.chunks(frame.width as usize) {
        println!("{}", row.iter().map(|c| c.glyph).collect::<String>());
    }
    if let Some(path) = std::env::args().nth(1) {
        let cells: Vec<_> = frame
            .cells
            .iter()
            .map(|c| serde_json::json!([c.glyph.to_string(), c.rgb]))
            .collect();
        std::fs::write(
            path,
            serde_json::to_vec(
                &serde_json::json!({"width":frame.width,"height":frame.height,"cells":cells}),
            )?,
        )?;
    }
    Ok(())
}
