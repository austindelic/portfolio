use anyhow::{Context, Result};
use clap::{Parser, ValueEnum};
use crossterm::{
    cursor::{Hide, Show},
    event::{
        self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind, KeyModifiers,
        MouseButton, MouseEventKind,
    },
    execute,
    terminal::{self, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{Terminal, backend::CrosstermBackend};
use std::{
    io::{self, IsTerminal},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tui_core::portfolio::{self, Action, Input, Page, PortfolioApp};
use tui_renderer::{Camera, Request, Worker, route};
#[derive(Clone, Copy, Debug, ValueEnum, PartialEq)]
enum RendererMode {
    Auto,
    Gpu,
    Static,
}
#[derive(Parser, Debug)]
#[command(version, about = "Austin Delic's portfolio, in your terminal")]
struct Args {
    #[arg(long, value_enum, default_value = "auto")]
    renderer: RendererMode,
    #[arg(long,default_value_t=30,value_parser=clap::value_parser!(u32).range(1..=60))]
    fps: u32,
    #[arg(long)]
    no_animation: bool,
    #[arg(long)]
    ascii: bool,
    /// Character width / height (e.g. 0.5); auto-detected when reported by the terminal.
    #[arg(long,value_parser=parse_aspect)]
    cell_aspect: Option<f32>,
    /// Maximum width of the animation grid; text retains full terminal resolution.
    #[arg(long, default_value_t=240, value_parser=clap::value_parser!(u16).range(40..=240))]
    render_columns: u16,
}
fn parse_aspect(s: &str) -> std::result::Result<f32, String> {
    let n: f32 = s.parse().map_err(|_| "Expected a number".to_string())?;
    if n.is_finite() && (0.2..=2.).contains(&n) {
        Ok(n)
    } else {
        Err("Cell aspect must be between 0.2 and 2".into())
    }
}
struct Session;
impl Session {
    fn enter() -> Result<Self> {
        terminal::enable_raw_mode()?;
        let guard = Self;
        execute!(io::stdout(), EnterAlternateScreen, EnableMouseCapture, Hide)?;
        Ok(guard)
    }
}
fn restore() {
    let _ = execute!(
        io::stdout(),
        DisableMouseCapture,
        Show,
        LeaveAlternateScreen
    );
    let _ = terminal::disable_raw_mode();
}
impl Drop for Session {
    fn drop(&mut self) {
        restore();
    }
}
fn main() -> Result<()> {
    let args = Args::parse();
    anyhow::ensure!(
        io::stdin().is_terminal() && io::stdout().is_terminal(),
        "Run austindelic in an interactive terminal (stdin and stdout must be TTYs)."
    );
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if std::thread::current().name() == Some("main") {
            restore();
            previous(info);
        }
    }));
    let stop = Arc::new(AtomicBool::new(false));
    let signal_stop = stop.clone();
    ctrlc::set_handler(move || signal_stop.store(true, Ordering::Relaxed))?;
    let _session = Session::enter()?;
    run(args, stop)
}
fn grid_size(width: u16, height: u16) -> (u16, u16) {
    let scale = (240. / f32::from(width.max(1)))
        .min(80. / f32::from(height.max(1)))
        .min(1.);
    (
        (f32::from(width) * scale).round().max(1.) as u16,
        (f32::from(height) * scale).round().max(1.) as u16,
    )
}

fn cell_aspect(override_value: Option<f32>) -> f32 {
    override_value.unwrap_or_else(|| {
        terminal::window_size()
            .ok()
            .filter(|s| s.width > 0 && s.height > 0 && s.columns > 0 && s.rows > 0)
            .map(|s| {
                ((s.width as f32 / s.columns as f32) / (s.height as f32 / s.rows as f32))
                    .clamp(0.2, 2.)
            })
            .unwrap_or(0.5)
    })
}
struct Explore {
    camera: Camera,
    time: f32,
    time_scale: f32,
    exposure: f32,
    bloom: f32,
    speed: f32,
    paused: bool,
}
impl Default for Explore {
    fn default() -> Self {
        Self {
            camera: Camera::default(),
            time: 0.,
            time_scale: 2.,
            exposure: 2.,
            bloom: 0.65,
            speed: 0.2,
            paused: false,
        }
    }
}
impl Explore {
    fn key(&mut self, key: KeyCode) -> bool {
        match key {
            KeyCode::Char('w') => self.camera.translate(self.speed, 0., 0.),
            KeyCode::Char('s') => self.camera.translate(-self.speed, 0., 0.),
            KeyCode::Char('a') => self.camera.translate(0., -self.speed, 0.),
            KeyCode::Char('d') => self.camera.translate(0., self.speed, 0.),
            KeyCode::Char('r') => self.camera.translate(0., 0., self.speed),
            KeyCode::Char('f') => self.camera.translate(0., 0., -self.speed),
            KeyCode::Char('i') => self.camera.look(0., 0.04),
            KeyCode::Char('k') => self.camera.look(0., -0.04),
            KeyCode::Char('j') => self.camera.look(0.04, 0.),
            KeyCode::Char('l') => self.camera.look(-0.04, 0.),
            KeyCode::Char('q') => self.camera.roll(0.04),
            KeyCode::Char('e') => self.camera.roll(-0.04),
            KeyCode::Up => self.speed = (self.speed * 1.25).min(10.),
            KeyCode::Down => self.speed = (self.speed / 1.25).max(0.005),
            KeyCode::Char(' ') => self.paused = !self.paused,
            KeyCode::Char('[') => self.time_scale = (self.time_scale - 0.05).max(0.),
            KeyCode::Char(']') => self.time_scale = (self.time_scale + 0.05).min(4.),
            KeyCode::Char('-') => self.exposure = (self.exposure - 0.05).max(0.),
            KeyCode::Char('+' | '=') => self.exposure = (self.exposure + 0.05).min(4.),
            KeyCode::Char(',') => self.bloom = (self.bloom - 0.01).max(0.),
            KeyCode::Char('.') => self.bloom = (self.bloom + 0.01).min(1.),
            KeyCode::Char('0') => *self = Self::default(),
            _ => return false,
        }
        true
    }
}
fn run(args: Args, stop: Arc<AtomicBool>) -> Result<()> {
    let mut terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;
    let mut app = PortfolioApp::new(args.ascii);
    let fallback = portfolio::fallback();
    let mut background = fallback.clone();
    let worker = (args.renderer != RendererMode::Static).then(|| Worker::start(args.fps));
    let mut explore = Explore::default();
    let mut size = terminal.size()?;
    let mut aspect = cell_aspect(args.cell_aspect);
    let mut generation = 0;
    let mut history = 0;
    let mut drag = None;
    let started = Instant::now();
    let mut last = started;
    let mut route_time = 0.;
    let mut route_start = None::<Camera>;
    let mut camera = Camera::default();
    let mut last_page = app.page.clone();
    let mut requested = false;
    let mut dirty = true;
    let mut last_draw = started - Duration::from_secs(1);
    let mut last_request = started - Duration::from_secs(1);
    let cadence = Duration::from_secs_f64(1. / f64::from(args.fps));
    let mut frames = 0u64;
    let mut input_at = None;
    let mut max_input_ms = 0f64;
    let resume_dir = tempfile::tempdir()?;
    // Linux clipboard ownership must survive until another application pastes.
    // Initialize lazily so startup needs no desktop clipboard.
    let mut clipboard = None;
    while !stop.load(Ordering::Relaxed) {
        let now = Instant::now();
        let dt = now.duration_since(last).as_secs_f32().min(0.1);
        last = now;
        if let Some(worker) = &worker {
            let status = worker.status.lock().unwrap().clone();
            if status != app.renderer_status {
                app.renderer_status = status;
                dirty = true;
            }
            app.gpu_available = app.renderer_status.starts_with("GPU");
            if app.renderer_status.starts_with("Static fallback:") {
                background = fallback.clone();
                if args.renderer == RendererMode::Gpu {
                    anyhow::bail!("{}", app.renderer_status);
                }
            }
            if let Some(frame) = worker.frame.lock().unwrap().take()
                && frame.generation == generation
            {
                background = frame;
                dirty = true;
                frames += 1;
            }
        }
        let animated = !args.no_animation && !explore.paused;
        if animated {
            explore.time += dt * explore.time_scale;
            if app.page != Page::Explore {
                route_time += dt;
            }
        }
        if app.page != last_page {
            if app.page == Page::Explore {
                explore.camera = camera.clone();
            } else {
                route_start = Some(camera.clone());
                route_time = 0.;
            }
            last_page = app.page.clone();
            generation += 1;
            history += 1;
            requested = false;
            dirty = true;
        }
        if app.page == Page::Explore {
            camera = explore.camera.clone();
        } else {
            let screen_aspect = f32::from(size.width) * aspect / f32::from(size.height.max(1));
            camera = if args.no_animation {
                route::camera(app.route(), 0., screen_aspect)
            } else if let Some(start) = &route_start {
                let end = route::camera(app.route(), route_time, screen_aspect);
                if route_time < 1.6 {
                    route::blend(start, &end, route_time / 1.6)
                } else {
                    end
                }
            } else {
                route::intro_camera(app.route(), route_time, screen_aspect)
            };
        }
        if let Some(worker) = &worker
            && (!requested || animated)
            && last_request.elapsed() >= cadence
            && !app.renderer_status.starts_with("Static fallback:")
        {
            worker.request(Request {
                width: render_grid(size.width, size.height, args.render_columns).0,
                height: render_grid(size.width, size.height, args.render_columns).1,
                generation,
                history,
                time: explore.time,
                aspect,
                camera: camera.clone(),
                exposure: explore.exposure,
                bloom: explore.bloom,
            });
            requested = true;
            last_request += cadence;
            if last_request.elapsed() > cadence {
                last_request = now;
            }
        }
        app.explore_help = format!(
            "Time {:.2}x  Exposure {:.2}  Bloom {:.2}  Speed {:.3} {}",
            explore.time_scale,
            explore.exposure,
            explore.bloom,
            explore.speed,
            if explore.paused { "[paused]" } else { "" }
        );
        if (dirty && last_draw.elapsed() >= Duration::from_millis(8))
            || last_draw.elapsed() >= Duration::from_secs(1)
        {
            terminal.draw(|f| app.render(f, &background))?;
            if let Some(at) = input_at.take() {
                let elapsed: Duration = Instant::now().duration_since(at);
                max_input_ms = max_input_ms.max(elapsed.as_secs_f64() * 1000.);
            }
            dirty = false;
            last_draw = now;
        }
        if event::poll(Duration::from_millis(5))? {
            let event = event::read()?;
            input_at = Some(Instant::now());
            dirty = true;
            let mut action = None;
            match event {
                Event::Key(key) if key.kind != KeyEventKind::Release => {
                    if key.code == KeyCode::Char('c')
                        && key.modifiers.contains(KeyModifiers::CONTROL)
                    {
                        break;
                    }
                    if key.code == KeyCode::Char('q') && app.page != Page::Explore {
                        break;
                    }
                    if !app.help
                        && app.page == Page::Explore
                        && app.gpu_available
                        && explore.key(key.code)
                    {
                        requested = false;
                        if key.code == KeyCode::Char('0') {
                            history += 1;
                            generation += 1;
                        }
                    } else {
                        let input = match key.code {
                            KeyCode::Tab => Some(Input::Next),
                            KeyCode::BackTab => Some(Input::Previous),
                            KeyCode::Up | KeyCode::Char('k') => Some(Input::Up),
                            KeyCode::Down | KeyCode::Char('j') => Some(Input::Down),
                            KeyCode::Left => Some(Input::Left),
                            KeyCode::Right => Some(Input::Right),
                            KeyCode::Enter => Some(Input::Enter),
                            KeyCode::Esc => Some(Input::Back),
                            KeyCode::PageUp => Some(Input::PageUp),
                            KeyCode::PageDown => Some(Input::PageDown),
                            KeyCode::Home => Some(Input::Home),
                            KeyCode::End => Some(Input::End),
                            KeyCode::Char('?') => Some(Input::Help),
                            _ => None,
                        };
                        if let Some(input) = input {
                            action = app.input(input);
                        }
                    }
                }
                Event::Resize(w, h) => {
                    size = ratatui::layout::Size::new(w, h);
                    aspect = cell_aspect(args.cell_aspect);
                    generation += 1;
                    history += 1;
                    requested = false;
                }
                Event::Mouse(m) => {
                    if app.page == Page::Explore && !app.help && app.gpu_available {
                        match m.kind {
                            MouseEventKind::Down(MouseButton::Left) => {
                                drag = Some((m.column, m.row))
                            }
                            MouseEventKind::Drag(MouseButton::Left) => {
                                if let Some((x, y)) = drag {
                                    explore.camera.look(
                                        (x as f32 - m.column as f32) * 0.012,
                                        (y as f32 - m.row as f32) * 0.02,
                                    );
                                }
                                drag = Some((m.column, m.row));
                                requested = false;
                            }
                            MouseEventKind::Up(_) => drag = None,
                            MouseEventKind::ScrollUp => {
                                explore.camera.translate(explore.speed, 0., 0.);
                                requested = false;
                            }
                            MouseEventKind::ScrollDown => {
                                explore.camera.translate(-explore.speed, 0., 0.);
                                requested = false;
                            }
                            _ => {}
                        }
                    } else {
                        action = match m.kind {
                            MouseEventKind::Down(MouseButton::Left) => {
                                app.input(Input::Click(m.column, m.row))
                            }
                            MouseEventKind::ScrollUp => app.input(Input::Wheel(-3)),
                            MouseEventKind::ScrollDown => app.input(Input::Wheel(3)),
                            _ => None,
                        };
                    }
                }
                _ => {}
            }
            if let Some(action) = action {
                app.status = match perform(
                    action,
                    &app.content.profile.email,
                    resume_dir.path(),
                    &mut clipboard,
                ) {
                    Ok(message) => message,
                    Err(e) => format!("Action failed: {e}"),
                };
            }
        }
    }
    if let Some(path) = std::env::var_os("AUSTINDELIC_DIAGNOSTICS") {
        std::fs::write(
            path,
            serde_json::to_vec_pretty(
                &serde_json::json!({"seconds":started.elapsed().as_secs_f64(),"gpu_frames":frames,"average_gpu_fps":frames as f64/started.elapsed().as_secs_f64(),"max_input_to_draw_ms":max_input_ms,"renderer":app.renderer_status}),
            )?,
        )?;
    }
    Ok(())
}
fn render_grid(width: u16, height: u16, columns: u16) -> (u16, u16) {
    let (w, h) = grid_size(width, height);
    let scale = (f32::from(columns) / f32::from(w)).min(1.);
    (
        (f32::from(w) * scale).round().max(1.) as u16,
        (f32::from(h) * scale).round().max(1.) as u16,
    )
}

fn perform(
    action: Action,
    email: &str,
    temp: &std::path::Path,
    clipboard: &mut Option<arboard::Clipboard>,
) -> Result<String> {
    match action {
        Action::Open(url) => {
            anyhow::ensure!(
                url.starts_with("https://")
                    || url.starts_with("http://")
                    || url.starts_with("mailto:"),
                "Unsupported link: {url}"
            );
            open::that(&url).with_context(|| {
                format!("Could not open {url}; select the URL and open it manually")
            })?;
            Ok(format!("Opened {url}"))
        }
        Action::Resume => {
            let path = temp.join("Austin-Delic-Resume.pdf");
            std::fs::write(&path, portfolio::RESUME)?;
            open::that(&path)
                .with_context(|| format!("Could not open resume: {}", path.display()))?;
            Ok("Opened resume in the default PDF viewer".into())
        }
        Action::CopyEmail => {
            if clipboard.is_none() {
                *clipboard = Some(
                    arboard::Clipboard::new()
                        .with_context(|| format!("Clipboard unavailable; select {email}"))?,
                );
            }
            clipboard
                .as_mut()
                .unwrap()
                .set_text(email)
                .with_context(|| format!("Clipboard unavailable; select {email}"))?;
            Ok(format!("Copied {email}"))
        }
        Action::Navigate(_) => Ok(String::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn render_resolution() {
        assert_eq!(render_grid(240, 80, 120), (120, 40));
        assert_eq!(render_grid(60, 18, 120), (60, 18));
    }
    #[test]
    fn arguments_validate_limits() {
        assert_eq!(grid_size(480, 80), (240, 40));
        assert_eq!(grid_size(120, 160), (60, 80));
        assert_eq!(grid_size(0, 0), (1, 1));
        for args in [
            vec!["austindelic", "--fps", "0"],
            vec!["austindelic", "--fps", "61"],
            vec!["austindelic", "--cell-aspect", "NaN"],
            vec!["austindelic", "--cell-aspect", "-1"],
        ] {
            assert!(Args::try_parse_from(args).is_err());
        }
        assert!(
            Args::try_parse_from([
                "austindelic",
                "--renderer",
                "static",
                "--ascii",
                "--no-animation"
            ])
            .is_ok()
        );
    }
    #[test]
    fn explore_controls_and_bounds() {
        let mut e = Explore::default();
        let start = e.camera.position;
        e.key(KeyCode::Char('w'));
        assert_ne!(e.camera.position, start);
        e.key(KeyCode::Char('s'));
        assert!(e.camera.position.distance(start) < 0.0001);
        let forward = e.camera.forward;
        e.key(KeyCode::Char('j'));
        assert_ne!(e.camera.forward, forward);
        let up = e.camera.up;
        e.key(KeyCode::Char('q'));
        assert_ne!(e.camera.up, up);
        e.key(KeyCode::Char(' '));
        assert!(e.paused);
        for _ in 0..1000 {
            e.key(KeyCode::Char(']'));
            e.key(KeyCode::Char('+'));
            e.key(KeyCode::Char('.'));
            e.key(KeyCode::Up);
        }
        assert_eq!(
            (e.time_scale, e.exposure, e.bloom, e.speed),
            (4., 4., 1., 10.)
        );
        for _ in 0..1000 {
            e.key(KeyCode::Char('['));
            e.key(KeyCode::Char('-'));
            e.key(KeyCode::Char(','));
            e.key(KeyCode::Down);
        }
        assert_eq!(
            (e.time_scale, e.exposure, e.bloom, e.speed),
            (0., 0., 0., 0.005)
        );
        e.key(KeyCode::Char('0'));
        assert_eq!((e.time_scale, e.exposure, e.bloom), (2., 2., 0.65));
        assert!(!e.paused);
    }
}
