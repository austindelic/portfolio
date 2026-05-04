use std::{cell::RefCell, io, rc::Rc};

use ratzilla::{
    event::{KeyCode, KeyEvent},
    DomBackend, WebRenderer,
};
use ratatui::Terminal;
use tui_core::{App, InputEvent};

fn key_to_input(key: KeyEvent) -> Option<InputEvent> {
    match key.code {
        KeyCode::Up | KeyCode::Char('k') => Some(InputEvent::Up),
        KeyCode::Down | KeyCode::Char('j') => Some(InputEvent::Down),
        KeyCode::Enter => Some(InputEvent::Enter),
        KeyCode::Esc | KeyCode::Char('q') => Some(InputEvent::Back),
        _ => None,
    }
}

fn main() -> io::Result<()> {
    let backend = DomBackend::new()?;
    let terminal = Terminal::new(backend)?;

    let state = Rc::new(RefCell::new(App::new()));

    let event_state = Rc::clone(&state);
    terminal.on_key_event(move |key_event| {
        if let Some(event) = key_to_input(key_event) {
            event_state.borrow_mut().handle_input(event);
        }
    });

    let render_state = Rc::clone(&state);
    terminal.draw_web(move |frame| {
        render_state.borrow_mut().render(frame);
    });

    Ok(())
}
