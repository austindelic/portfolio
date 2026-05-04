use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, List, ListItem, ListState, Paragraph, Wrap},
    Frame,
};

// --- Portfolio data ---

pub struct Project {
    pub name: String,
    pub description: String,
    pub tech: Vec<String>,
    pub url: Option<String>,
}

pub struct Profile {
    pub name: String,
    pub bio: String,
    pub contact: ContactInfo,
}

pub struct ContactInfo {
    pub email: String,
    pub github: String,
    pub website: String,
}

pub fn get_projects() -> Vec<Project> {
    vec![
        Project {
            name: "SSH Portfolio".to_string(),
            description: "This terminal — an interactive SSH portfolio built with Rust, russh, and ratatui.".to_string(),
            tech: vec!["Rust".to_string(), "russh".to_string(), "ratatui".to_string()],
            url: Some("https://github.com/austindelic".to_string()),
        },
        Project {
            name: "Portfolio Website".to_string(),
            description: "Personal site and blog built with Astro and TypeScript in a Turborepo monorepo.".to_string(),
            tech: vec!["Astro".to_string(), "TypeScript".to_string(), "React".to_string()],
            url: Some("https://austindelic.com".to_string()),
        },
        Project {
            name: "Distributed Cache".to_string(),
            description: "High-throughput distributed cache with consistent hashing and replication.".to_string(),
            tech: vec!["Rust".to_string(), "Tokio".to_string()],
            url: None,
        },
    ]
}

pub fn get_profile() -> Profile {
    Profile {
        name: "Austin Delic".to_string(),
        bio: "Systems engineer focused on building fast, reliable infrastructure.\n\n\
              I work across the stack but feel most at home in Rust, TypeScript, \
              and low-level systems code.\n\n\
              Currently building developer tooling and exploring distributed systems."
            .to_string(),
        contact: ContactInfo {
            email: "austin@austindelic.com".to_string(),
            github: "github.com/austindelic".to_string(),
            website: "austindelic.com".to_string(),
        },
    }
}

// --- Shared TUI app ---

#[derive(Clone, PartialEq)]
pub enum Screen {
    Menu,
    Projects,
    About,
    Contact,
}

pub enum InputEvent {
    Up,
    Down,
    Enter,
    Back,
    Quit,
}

pub struct App {
    pub screen: Screen,
    menu_state: ListState,
    projects_state: ListState,
    projects: Vec<Project>,
    profile: Profile,
}

impl App {
    pub fn new() -> Self {
        let mut menu_state = ListState::default();
        menu_state.select(Some(0));
        let mut projects_state = ListState::default();
        projects_state.select(Some(0));
        Self {
            screen: Screen::Menu,
            menu_state,
            projects_state,
            projects: get_projects(),
            profile: get_profile(),
        }
    }

    /// Returns true if the app should exit.
    pub fn handle_input(&mut self, event: InputEvent) -> bool {
        match (&self.screen, event) {
            (Screen::Menu, InputEvent::Up) => {
                let i = self.menu_state.selected().unwrap_or(0);
                self.menu_state.select(Some(i.saturating_sub(1)));
            }
            (Screen::Menu, InputEvent::Down) => {
                let i = self.menu_state.selected().unwrap_or(0);
                self.menu_state.select(Some((i + 1).min(2)));
            }
            (Screen::Menu, InputEvent::Enter) => match self.menu_state.selected() {
                Some(0) => self.screen = Screen::Projects,
                Some(1) => self.screen = Screen::About,
                Some(2) => self.screen = Screen::Contact,
                _ => {}
            },
            (Screen::Projects, InputEvent::Up) => {
                let i = self.projects_state.selected().unwrap_or(0);
                self.projects_state.select(Some(i.saturating_sub(1)));
            }
            (Screen::Projects, InputEvent::Down) => {
                let i = self.projects_state.selected().unwrap_or(0);
                let max = self.projects.len().saturating_sub(1);
                self.projects_state.select(Some((i + 1).min(max)));
            }
            (Screen::Projects, InputEvent::Back | InputEvent::Quit) => {
                self.screen = Screen::Menu;
            }
            (Screen::About, InputEvent::Back | InputEvent::Quit) => {
                self.screen = Screen::Menu;
            }
            (Screen::Contact, InputEvent::Back | InputEvent::Quit) => {
                self.screen = Screen::Menu;
            }
            (_, InputEvent::Quit) => return true,
            _ => {}
        }
        false
    }

    pub fn render(&mut self, frame: &mut Frame) {
        match self.screen.clone() {
            Screen::Menu => self.render_menu(frame),
            Screen::Projects => self.render_projects(frame),
            Screen::About => self.render_about(frame),
            Screen::Contact => self.render_contact(frame),
        }
    }

    fn render_menu(&mut self, frame: &mut Frame) {
        let area = frame.area();
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3),
                Constraint::Min(0),
                Constraint::Length(1),
            ])
            .split(area);

        let title = Paragraph::new("Austin Delic")
            .alignment(Alignment::Center)
            .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_type(BorderType::Rounded),
            );
        frame.render_widget(title, chunks[0]);

        let items = vec![
            ListItem::new("  Projects"),
            ListItem::new("  About"),
            ListItem::new("  Contact"),
        ];
        let list = List::new(items)
            .block(
                Block::default()
                    .title(" Menu ")
                    .borders(Borders::ALL)
                    .border_type(BorderType::Rounded),
            )
            .highlight_style(
                Style::default()
                    .fg(Color::Black)
                    .bg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            )
            .highlight_symbol("> ");
        frame.render_stateful_widget(list, chunks[1], &mut self.menu_state);

        let help = Paragraph::new("  j/k or arrows: navigate   Enter: select   q: quit")
            .style(Style::default().fg(Color::DarkGray));
        frame.render_widget(help, chunks[2]);
    }

    fn render_projects(&mut self, frame: &mut Frame) {
        let area = frame.area();
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(0), Constraint::Length(1)])
            .split(area);

        let items: Vec<ListItem> = self
            .projects
            .iter()
            .map(|p| {
                let tech = p.tech.join(", ");
                ListItem::new(vec![
                    Line::from(Span::styled(
                        p.name.clone(),
                        Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
                    )),
                    Line::from(Span::styled(
                        p.description.clone(),
                        Style::default().fg(Color::White),
                    )),
                    Line::from(Span::styled(
                        format!("  {tech}"),
                        Style::default().fg(Color::DarkGray),
                    )),
                    Line::from(""),
                ])
            })
            .collect();

        let list = List::new(items)
            .block(
                Block::default()
                    .title(" Projects ")
                    .borders(Borders::ALL)
                    .border_type(BorderType::Rounded),
            )
            .highlight_style(Style::default().add_modifier(Modifier::BOLD))
            .highlight_symbol("▶ ");
        frame.render_stateful_widget(list, chunks[0], &mut self.projects_state);

        let help = Paragraph::new("  j/k or arrows: navigate   Esc/q: back")
            .style(Style::default().fg(Color::DarkGray));
        frame.render_widget(help, chunks[1]);
    }

    fn render_about(&mut self, frame: &mut Frame) {
        let area = frame.area();
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(0), Constraint::Length(1)])
            .split(area);

        let bio = Paragraph::new(self.profile.bio.clone())
            .block(
                Block::default()
                    .title(format!(" About — {} ", self.profile.name))
                    .borders(Borders::ALL)
                    .border_type(BorderType::Rounded),
            )
            .style(Style::default().fg(Color::White))
            .wrap(Wrap { trim: true });
        frame.render_widget(bio, chunks[0]);

        let help = Paragraph::new("  Esc/q: back")
            .style(Style::default().fg(Color::DarkGray));
        frame.render_widget(help, chunks[1]);
    }

    fn render_contact(&mut self, frame: &mut Frame) {
        let area = frame.area();
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(0), Constraint::Length(1)])
            .split(area);

        let c = &self.profile.contact;
        let text = format!(
            "Email    {}\nGitHub   {}\nWeb      {}",
            c.email, c.github, c.website
        );
        let para = Paragraph::new(text)
            .block(
                Block::default()
                    .title(" Contact ")
                    .borders(Borders::ALL)
                    .border_type(BorderType::Rounded),
            )
            .style(Style::default().fg(Color::White));
        frame.render_widget(para, chunks[0]);

        let help = Paragraph::new("  Esc/q: back")
            .style(Style::default().fg(Color::DarkGray));
        frame.render_widget(help, chunks[1]);
    }
}
