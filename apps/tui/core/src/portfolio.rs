use crate::frame::{Cell, CellFrame};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    time::{SystemTime, UNIX_EPOCH},
};

fn border(ascii: bool) -> ratatui::symbols::border::Set<'static> {
    if ascii {
        ratatui::symbols::border::Set {
            top_left: "+",
            top_right: "+",
            bottom_left: "+",
            bottom_right: "+",
            vertical_left: "|",
            vertical_right: "|",
            horizontal_top: "-",
            horizontal_bottom: "-",
        }
    } else {
        ratatui::symbols::border::PLAIN
    }
}

pub const BG: Color = Color::Rgb(0, 0, 0);
const SELECTED_FG: Color = Color::Rgb(34, 34, 34);
pub const FG: Color = Color::Rgb(192, 192, 192);
pub const ACCENT: Color = Color::Rgb(255, 161, 51);
const MUTED: Color = Color::Rgb(176, 176, 161);
const BORDER: Color = Color::Rgb(96, 96, 82);
#[derive(Clone, Deserialize)]
pub struct Profile {
    pub name: String,
    pub subtitle: String,
    pub bio: String,
    pub location: String,
    pub work: String,
    pub focus: String,
    pub email: String,
    pub stack: BTreeMap<String, String>,
}
#[derive(Clone, Deserialize)]
pub struct Project {
    pub title: String,
    pub description: String,
    pub label: String,
    pub link: Option<String>,
}
#[derive(Clone, Deserialize)]
pub struct Social {
    pub title: String,
    pub description: String,
    pub href: String,
}
#[derive(Clone, Deserialize)]
pub struct Content {
    pub profile: Profile,
    pub projects: Vec<Project>,
    pub socials: Vec<Social>,
}
#[derive(Clone, Deserialize)]
pub struct Post {
    pub title: String,
    pub description: String,
    #[serde(rename = "publishDate")]
    pub date: String,
    pub slug: String,
    pub body: String,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Page {
    Home,
    Blog,
    Post(usize),
    Socials,
    Explore,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Action {
    Navigate(Page),
    Open(String),
    Resume,
    CopyEmail,
}
#[derive(Clone, Debug)]
pub enum Input {
    Next,
    Previous,
    Up,
    Down,
    Left,
    Right,
    Enter,
    Back,
    PageUp,
    PageDown,
    Home,
    End,
    Help,
    Click(u16, u16),
    Wheel(i16),
}
#[derive(Clone, Debug)]
struct Row {
    text: String,
    kind: Kind,
    action: Option<Action>,
}
#[derive(Clone, Copy, Debug)]
enum Kind {
    Body,
    Heading,
    Muted,
    Code,
}
impl Row {
    fn new(text: impl Into<String>, kind: Kind) -> Self {
        Self {
            text: text.into(),
            kind,
            action: None,
        }
    }
    fn link(text: impl Into<String>, action: Action) -> Self {
        Self {
            text: text.into(),
            kind: Kind::Body,
            action: Some(action),
        }
    }
}
#[derive(Clone)]
struct View {
    page: Page,
    scroll: usize,
    focus: usize,
}
pub struct PortfolioApp {
    pub page: Page,
    pub content: Content,
    pub posts: Vec<Post>,
    pub ascii: bool,
    pub terminal_background: bool,
    pub help: bool,
    pub status: String,
    pub renderer_status: String,
    pub explore_help: String,
    pub gpu_available: bool,
    scroll: usize,
    focus: usize,
    history: Vec<View>,
    hits: Vec<(Rect, usize)>,
    actions: Vec<Action>,
    action_rows: Vec<usize>,
    max_scroll: usize,
    body_height: usize,
}
impl Default for PortfolioApp {
    fn default() -> Self {
        Self::new(false)
    }
}
impl PortfolioApp {
    pub fn new(ascii: bool) -> Self {
        Self {
            page: Page::Home,
            content: serde_json::from_str(include_str!("../assets/portfolio.json"))
                .expect("validated bundled content"),
            posts: serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/posts.json")))
                .expect("validated bundled posts"),
            ascii,
            terminal_background: false,
            help: false,
            status: String::new(),
            renderer_status: "Static background".into(),
            explore_help: String::new(),
            gpu_available: false,
            scroll: 0,
            focus: 0,
            history: Vec::new(),
            hits: Vec::new(),
            actions: Vec::new(),
            action_rows: Vec::new(),
            max_scroll: 0,
            body_height: 1,
        }
    }
    pub fn route(&self) -> &'static str {
        match self.page {
            Page::Home => "/",
            Page::Blog => "/blog",
            Page::Post(_) => "/blog/*",
            Page::Socials => "/socials",
            Page::Explore => "/",
        }
    }
    pub fn navigate(&mut self, page: Page) {
        if page != self.page {
            self.history.push(View {
                page: self.page.clone(),
                scroll: self.scroll,
                focus: self.focus,
            });
            self.page = page;
            self.scroll = 0;
            self.focus = 0;
            self.status.clear();
            self.actions.clear();
        }
    }
    pub fn resolve(&self, url: &str) -> Action {
        let url = clean(url, false);
        let internal = url
            .strip_prefix("https://austindelic.com")
            .filter(|s| s.is_empty() || s.starts_with('/'))
            .unwrap_or(&url);
        let path = internal
            .split(['?', '#'])
            .next()
            .unwrap_or(internal)
            .trim_end_matches('/');
        match path {
            "" => Action::Navigate(Page::Home),
            "/blog" => Action::Navigate(Page::Blog),
            "/socials" => Action::Navigate(Page::Socials),
            "/resume.pdf" => Action::Resume,
            _ => {
                if let Some(slug) = path.strip_prefix("/blog/") {
                    if let Some(i) = self.posts.iter().position(|p| p.slug == slug) {
                        return Action::Navigate(Page::Post(i));
                    }
                }
                Action::Open(if url.starts_with('/') {
                    format!("https://austindelic.com{url}")
                } else {
                    url
                })
            }
        }
    }
    fn activate(&mut self, index: usize) -> Option<Action> {
        let action = if index < 5 {
            match index {
                0 => Action::Navigate(Page::Home),
                1 => Action::Navigate(Page::Blog),
                2 => Action::Navigate(Page::Socials),
                3 => Action::Resume,
                _ => Action::Navigate(Page::Explore),
            }
        } else {
            self.actions.get(index - 5)?.clone()
        };
        if let Action::Navigate(ref page) = action {
            self.navigate(page.clone());
            None
        } else {
            Some(action)
        }
    }
    pub fn input(&mut self, input: Input) -> Option<Action> {
        if self.help {
            if matches!(input, Input::Back | Input::Help | Input::Enter) {
                self.help = false;
            }
            return None;
        }
        match input {
            Input::Help => self.help = true,
            Input::Next | Input::Previous => {
                let total = 5 + self.actions.len();
                self.focus = if matches!(input, Input::Next) {
                    (self.focus + 1) % total
                } else {
                    (self.focus + total - 1) % total
                };
                self.reveal_focus();
            }
            Input::Left | Input::Right => {
                self.focus = if matches!(input, Input::Right) {
                    (self.focus.min(4) + 1) % 5
                } else {
                    (self.focus.min(4) + 4) % 5
                };
            }
            Input::Up => self.scroll = self.scroll.saturating_sub(1),
            Input::Down => self.scroll = (self.scroll + 1).min(self.max_scroll),
            Input::PageUp => {
                self.scroll = self
                    .scroll
                    .saturating_sub(self.body_height.saturating_sub(1))
            }
            Input::PageDown => {
                self.scroll =
                    (self.scroll + self.body_height.saturating_sub(1)).min(self.max_scroll)
            }
            Input::Home => self.scroll = 0,
            Input::End => self.scroll = self.max_scroll,
            Input::Wheel(delta) => {
                if delta < 0 {
                    self.scroll = self.scroll.saturating_sub((-delta) as usize);
                } else {
                    self.scroll = (self.scroll + delta as usize).min(self.max_scroll);
                }
            }
            Input::Enter => return self.activate(self.focus),
            Input::Back => {
                if let Some(view) = self.history.pop() {
                    self.page = view.page;
                    self.scroll = view.scroll;
                    self.focus = view.focus;
                    self.actions.clear();
                } else if self.page != Page::Home {
                    self.page = Page::Home;
                    self.scroll = 0;
                    self.focus = 0;
                }
            }
            Input::Click(x, y) => {
                if let Some((_, index)) = self.hits.iter().find(|(r, _)| r.contains((x, y).into()))
                {
                    let index = *index;
                    self.focus = index;
                    return self.activate(index);
                }
            }
        }
        None
    }
    fn reveal_focus(&mut self) {
        if self.focus >= 5 {
            if let Some(row) = self.action_rows.get(self.focus - 5) {
                if *row < self.scroll {
                    self.scroll = *row;
                } else if *row >= self.scroll + self.body_height {
                    self.scroll = row.saturating_sub(self.body_height - 1);
                }
                self.scroll = self.scroll.min(self.max_scroll);
            }
        }
    }
    fn document(&self) -> Vec<Row> {
        let mut rows = Vec::new();
        let p = &self.content.profile;
        match self.page {
            Page::Home => {
                rows.push(Row::new(
                    format!("01 / ABOUT                         {}", p.location),
                    Kind::Muted,
                ));
                rows.push(Row::new(format!("{}.", p.name), Kind::Heading));
                rows.push(Row::new(&p.subtitle, Kind::Body));
                rows.push(Row::new("", Kind::Body));
                rows.push(Row::new(&p.bio, Kind::Body));
                rows.push(Row::new("", Kind::Body));
                for (label, value) in [
                    ("Location", &p.location),
                    ("Work", &p.work),
                    ("Focus", &p.focus),
                ] {
                    rows.push(Row::new(format!("{label:8} {value}"), Kind::Body));
                }
                rows.push(Row::link(
                    format!("@ Contact  {}", p.email),
                    Action::Open(format!("mailto:{}", p.email)),
                ));
                rows.push(Row::link("Copy email", Action::CopyEmail));
                rows.push(Row::new(
                    format!(
                        "Stack    {}",
                        p.stack.keys().cloned().collect::<Vec<_>>().join(" / ")
                    ),
                    Kind::Muted,
                ));
                rows.push(Row::new("", Kind::Body));
                rows.push(Row::new("02 / PROJECTS", Kind::Heading));
                for (i, p) in self.content.projects.iter().enumerate() {
                    let title = format!("{:02}  {}  / {}", i + 1, p.title, p.label);
                    rows.push(match &p.link {
                        Some(link) => Row::link(title, self.resolve(link)),
                        None => Row::new(title, Kind::Body),
                    });
                    rows.push(Row::new(&p.description, Kind::Muted));
                    rows.push(Row::new("", Kind::Body));
                }
                rows.push(Row::new("03 / LATEST POSTS", Kind::Heading));
                self.post_rows(&mut rows);
            }
            Page::Blog => {
                rows.push(Row::new("WRITING / ARCHIVE", Kind::Muted));
                rows.push(Row::new("Blog posts", Kind::Heading));
                self.post_rows(&mut rows);
            }
            Page::Socials => {
                rows.push(Row::new("SOCIAL LINKS", Kind::Muted));
                rows.push(Row::new(format!("{}.", p.name), Kind::Heading));
                for (i, s) in self.content.socials.iter().enumerate() {
                    rows.push(Row::link(
                        format!("{:02}  {}  ->", i + 1, s.title),
                        self.resolve(&s.href),
                    ));
                    rows.push(Row::new(&s.description, Kind::Muted));
                    rows.push(Row::new("", Kind::Body));
                }
            }
            Page::Post(i) => {
                if let Some(post) = self.posts.get(i) {
                    rows.push(Row::new(&post.title, Kind::Heading));
                    rows.push(Row::new(&post.date, Kind::Muted));
                    rows.push(Row::new(&post.description, Kind::Muted));
                    rows.push(Row::new("", Kind::Body));
                    rows.extend(markdown(&post.body, |url| {
                        let url = if !url.starts_with('/') && !url.contains(':') {
                            format!("https://austindelic.com/blog/{}/{url}", post.slug)
                        } else {
                            url.to_string()
                        };
                        self.resolve(&url)
                    }));
                }
            }
            Page::Explore => {}
        }
        rows
    }
    fn post_rows(&self, rows: &mut Vec<Row>) {
        for (i, p) in self.posts.iter().enumerate() {
            rows.push(Row::link(
                format!("{}  {}", p.date, p.title),
                Action::Navigate(Page::Post(i)),
            ));
            rows.push(Row::new(&p.description, Kind::Muted));
            rows.push(Row::new("", Kind::Body));
        }
    }
    pub fn render(&mut self, frame: &mut Frame, background: &CellFrame) {
        let area = frame.area();
        let bg = if self.terminal_background {
            Color::Reset
        } else {
            BG
        };
        self.hits.clear();
        frame.render_widget(Block::default().style(Style::default().bg(bg)), area);
        paint_background(frame, background);
        if area.width < 60 || area.height < 18 {
            frame.render_widget(Clear, area);
            frame.render_widget(
                Paragraph::new("Resize terminal to at least 60 x 18\nq / Ctrl-C: quit")
                    .style(Style::default().fg(FG).bg(bg)),
                area,
            );
            return;
        }
        if self.page == Page::Explore {
            let help = if self.gpu_available {
                self.explore_help.clone()
            } else {
                format!(
                    "{} | Animation unavailable; Esc returns",
                    self.renderer_status
                )
            };
            let box_area = Rect::new(1, area.height.saturating_sub(5), area.width - 2, 4);
            paint_panel(frame, background, box_area, bg);
            render_panel_text(
                frame,
                &clean(
                    &format!("EXPLORE  /  Esc return  ? help  Space pause  0 reset\nWASD move · RF vertical · IJKL look · QE roll · arrows speed\n{help}"),
                    self.ascii,
                ),
                Style::default().fg(FG).bg(bg),
                box_area,
                false,
            );
        } else {
            let width = if area.width >= 120 {
                76.min(area.width - 4)
            } else {
                area.width - 2
            };
            let x = if area.width >= 120 && self.page == Page::Home {
                area.width - width - 2
            } else {
                (area.width - width) / 2
            };
            let panel = Rect::new(x, 1, width, area.height - 3);
            paint_panel(frame, background, panel, bg);
            frame.render_widget(
                Block::default()
                    .borders(Borders::ALL)
                    .border_set(border(self.ascii))
                    .border_style(Style::default().fg(BORDER))
                    .style(Style::default().bg(bg)),
                panel,
            );
            let labels = if self.ascii {
                ["Home", "Blog", "Socials", "Resume", "Explore"]
            } else {
                ["⌂ Home", "≡ Blog", "@ Socials", "↓ Resume", "◎ Explore"]
            };
            let mut nx = x + 2;
            for (i, label) in labels.iter().enumerate() {
                let w = unicode_width::UnicodeWidthStr::width(*label) as u16 + 2;
                let rect = Rect::new(nx, 2, w, 1);
                render_panel_text(
                    frame,
                    &format!(" {label} "),
                    if self.focus == i {
                        Style::default().fg(SELECTED_FG).bg(ACCENT)
                    } else {
                        Style::default().fg(FG).bg(bg)
                    },
                    rect,
                    self.focus == i,
                );
                self.hits.push((rect, i));
                nx += w;
            }
            let secs = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                + 8 * 3600;
            let clock = format!(
                "PERTH / {:02}:{:02}:{:02}",
                secs / 3600 % 24,
                secs / 60 % 60,
                secs % 60
            );
            render_panel_text(
                frame,
                &clock,
                Style::default().fg(MUTED).bg(bg),
                Rect::new(x + 2, 3, width - 4, 1),
                false,
            );
            let body = Rect::new(x + 2, 5, width - 4, panel.height.saturating_sub(5));
            self.body_height = body.height as usize;
            self.actions.clear();
            self.action_rows.clear();
            let mut display = Vec::<(String, Kind, Option<usize>)>::new();
            for row in self.document() {
                let action = row.action.map(|a| {
                    let index = self.actions.len();
                    self.actions.push(a);
                    self.action_rows.push(display.len());
                    index + 5
                });
                let text = clean(&row.text, self.ascii);
                let text = if action.is_some() {
                    format!(
                        "{} {text}",
                        if action == Some(self.focus) { ">" } else { " " }
                    )
                } else {
                    text
                };
                for line in textwrap::wrap(&text, usize::from(body.width).max(1)) {
                    display.push((line.into_owned(), row.kind, action));
                }
            }
            self.max_scroll = display.len().saturating_sub(self.body_height);
            self.scroll = self.scroll.min(self.max_scroll);
            self.focus = self.focus.min(4 + self.actions.len());
            for (y, (text, kind, action)) in display
                .iter()
                .skip(self.scroll)
                .take(body.height as usize)
                .enumerate()
            {
                let rect = Rect::new(body.x, body.y + y as u16, body.width, 1);
                let color = match kind {
                    Kind::Heading => ACCENT,
                    Kind::Muted => MUTED,
                    _ => FG,
                };
                let mut style = Style::default().fg(color).bg(bg);
                if matches!(kind, Kind::Heading) {
                    style = style.add_modifier(Modifier::BOLD);
                }
                if *action == Some(self.focus) {
                    style = style.fg(SELECTED_FG).bg(ACCENT);
                }
                render_panel_text(frame, text, style, rect, *action == Some(self.focus));
                if let Some(index) = action {
                    self.hits.push((rect, *index));
                }
            }
        }
        let footer = if self.status.is_empty() {
            format!(
                "Tab focus  Enter open  j/k scroll  ? help  q quit  | {}",
                self.renderer_status
            )
        } else {
            self.status.clone()
        };
        let footer_area = Rect::new(0, area.height - 1, area.width, 1);
        paint_panel(frame, background, footer_area, bg);
        render_panel_text(
            frame,
            &clean(&footer, self.ascii),
            Style::default().fg(MUTED).bg(bg),
            footer_area,
            false,
        );
        if self.help {
            let width = (area.width - 4).min(78);
            let rect = Rect::new((area.width - width) / 2, 1, width, area.height - 2);
            paint_panel(frame, background, rect, bg);
            let help = if area.height < 24 {
                "Tab/Shift-Tab focus; Enter open
Arrows/j/k scroll; Home/End jump
Esc back; q quit; Ctrl-C quit anywhere
Explore: WASD move; RF rise/descend
IJKL look; QE roll; arrows speed
Drag look; wheel move
Space pause; 0 reset
[/] time; -/+ exposure; ,/. bloom
Esc / ? / Enter closes help"
            } else if self.page == Page::Explore {
                "EXPLORE\n\nW/A/S/D: forward / left / backward / right\nR/F: rise / descend   I/J/K/L: look\nQ/E: roll   Up/Down: movement speed\nSpace: pause   0: reset view and settings\n[/]: time scale   -/+: exposure   ,/.: bloom\nDrag: look   Mouse wheel: forward/back\n\nEsc: return   Ctrl-C: quit"
            } else {
                "PORTFOLIO\n\nTab / Shift-Tab: focus navigation and links\nLeft/Right: navigation   Enter: activate\nUp/Down or j/k: scroll\nPageUp/PageDown, Home/End: long content\nClick: activate   Mouse wheel: scroll\nEsc: back   q / Ctrl-C: quit\n\nContent is bundled for offline reading.\nExternal links open only when activated.\nSet Departure Mono in your terminal for the intended look.\n\nEsc / ? / Enter: close help"
            };
            let block = Block::bordered()
                .border_set(border(self.ascii))
                .style(Style::default().bg(bg))
                .border_style(Style::default().fg(ACCENT))
                .title_style(Style::default().fg(FG))
                .title(" Help ");
            let inner = block.inner(rect);
            frame.render_widget(block, rect);
            render_panel_text(frame, help, Style::default().fg(FG).bg(bg), inner, false);
        }
    }
}
fn markdown(body: &str, resolve: impl Fn(&str) -> Action) -> Vec<Row> {
    let mut rows = Vec::new();
    let mut text = String::new();
    let mut kind = Kind::Body;
    let mut links = Vec::new();
    let mut list_depth: usize = 0;
    let mut code = false;
    let flush = |rows: &mut Vec<Row>, text: &mut String, kind| {
        if !text.is_empty() {
            rows.push(Row::new(std::mem::take(text), kind));
        }
    };
    for event in Parser::new_ext(
        body,
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS,
    ) {
        match event {
            Event::Start(Tag::Heading { .. }) => {
                flush(&mut rows, &mut text, kind);
                kind = Kind::Heading;
            }
            Event::Start(Tag::CodeBlock(_)) => {
                flush(&mut rows, &mut text, kind);
                kind = Kind::Code;
                code = true;
            }
            Event::Start(Tag::BlockQuote(_)) => text.push_str("> "),
            Event::Start(Tag::List(_)) => list_depth += 1,
            Event::Start(Tag::Item) => {
                flush(&mut rows, &mut text, kind);
                text.push_str(&format!("{}- ", "  ".repeat(list_depth.saturating_sub(1))));
            }
            Event::Start(Tag::Link { dest_url, .. })
            | Event::Start(Tag::Image { dest_url, .. }) => {
                links.push(dest_url.to_string());
                text.push_str(&format!("[{}] ", links.len()));
            }
            Event::Text(s) | Event::Code(s) => {
                if code {
                    for (i, line) in s.split('\n').enumerate() {
                        if i > 0 {
                            flush(&mut rows, &mut text, kind);
                        }
                        text.push_str("  ");
                        text.push_str(line);
                    }
                } else {
                    text.push_str(&s);
                }
            }
            Event::SoftBreak => text.push(' '),
            Event::HardBreak => flush(&mut rows, &mut text, kind),
            Event::Rule => rows.push(Row::new("--------------------------------", Kind::Muted)),
            Event::TaskListMarker(done) => text.push_str(if done { "[x] " } else { "[ ] " }),
            Event::End(TagEnd::List(_)) => list_depth = list_depth.saturating_sub(1),
            Event::End(
                TagEnd::Heading(_)
                | TagEnd::Paragraph
                | TagEnd::CodeBlock
                | TagEnd::Item
                | TagEnd::TableRow,
            ) => {
                flush(&mut rows, &mut text, kind);
                rows.push(Row::new("", Kind::Body));
                kind = Kind::Body;
                code = false;
            }
            Event::End(TagEnd::TableCell) => text.push_str(" | "),
            _ => {}
        }
    }
    flush(&mut rows, &mut text, kind);
    if !links.is_empty() {
        rows.push(Row::new("LINKS / IMAGES", Kind::Heading));
        for (i, url) in links.iter().enumerate() {
            rows.push(Row::link(format!("[{}] {}", i + 1, url), resolve(url)));
        }
    }
    rows
}
/// Strip terminal controls (including the entire CSI/OSC sequence), preserve readable text.
pub fn clean(text: &str, ascii: bool) -> String {
    let mut out = String::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.next() {
                Some('[') => {
                    for c in chars.by_ref() {
                        if ('@'..='~').contains(&c) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    while let Some(c) = chars.next() {
                        if c == '\x07' {
                            break;
                        }
                        if c == '\x1b' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                _ => {}
            }
            continue;
        }
        if c.is_control() {
            if c == '\n' || c == '\t' {
                out.push(' ');
            }
            continue;
        }
        if ascii && !c.is_ascii() {
            out.push_str(match c {
                '–' | '—' => "-",
                '’' | '‘' => "'",
                '“' | '”' => "\"",
                '·' => "/",
                '→' => "->",
                _ => "?",
            });
        } else {
            out.push(c);
        }
    }
    out
}
// Terminal cells cannot alpha-blend glyphs. Preserve the artwork in unused cells
// and give each text run (including internal spaces) an opaque backing.
fn render_panel_text(frame: &mut Frame, text: &str, style: Style, area: Rect, selected: bool) {
    for (y, line) in text.lines().take(area.height as usize).enumerate() {
        let line = line.trim_end();
        let width = if selected {
            area.width
        } else {
            unicode_width::UnicodeWidthStr::width(line).min(usize::from(area.width)) as u16
        };
        let rect = Rect::new(area.x, area.y + y as u16, width, 1);
        frame.render_widget(Clear, rect);
        frame.render_widget(Paragraph::new(line).style(style), rect);
    }
}

fn paint_panel(frame: &mut Frame, bg: &CellFrame, area: Rect, background: Color) {
    // Repaint from the source, not the composed screen: help must hide page text
    // and overlapping panels must not dim the artwork twice.
    frame.render_widget(Clear, area);
    frame.render_widget(
        Block::default().style(Style::default().bg(background)),
        area,
    );
    paint_background_region(frame, bg, area, 15);
}

/// Paint artwork glyphs while preserving the background already set on the frame.
pub fn paint_background(frame: &mut Frame, bg: &CellFrame) {
    paint_background_region(frame, bg, frame.area(), 100);
}

fn paint_background_region(frame: &mut Frame, bg: &CellFrame, region: Rect, brightness: u16) {
    if bg.width == 0 || bg.height == 0 {
        return;
    }
    let area = frame.area();
    let region = region.intersection(area);
    for y in region.y..region.bottom() {
        for x in region.x..region.right() {
            let sx = u32::from(x - area.x) * u32::from(bg.width) / u32::from(area.width);
            let sy = u32::from(y - area.y) * u32::from(bg.height) / u32::from(area.height);
            if let Some(c) = bg.cells.get((sy * u32::from(bg.width) + sx) as usize) {
                let rgb = c
                    .rgb
                    .map(|channel| (u16::from(channel) * brightness / 100) as u8);
                frame.buffer_mut()[(x, y)]
                    .set_char(c.glyph)
                    .set_fg(Color::Rgb(rgb[0], rgb[1], rgb[2]));
            }
        }
    }
}
pub fn fallback() -> CellFrame {
    #[derive(Deserialize)]
    struct F {
        width: u16,
        height: u16,
        cells: Vec<(char, [u8; 3])>,
    }
    let f: F =
        serde_json::from_str(include_str!("../assets/fallback.json")).expect("valid fallback");
    CellFrame {
        width: f.width,
        height: f.height,
        generation: 0,
        cells: f
            .cells
            .into_iter()
            .map(|(glyph, rgb)| Cell { glyph, rgb })
            .collect(),
    }
}
pub const RESUME: &[u8] = include_bytes!("../assets/resume.pdf");

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::{backend::TestBackend, Terminal};
    fn render(app: &mut PortfolioApp, w: u16, h: u16) -> String {
        let mut terminal = Terminal::new(TestBackend::new(w, h)).unwrap();
        terminal
            .draw(|f| app.render(f, &CellFrame::default()))
            .unwrap();
        let buffer = terminal.backend().buffer();
        let mut lines = Vec::new();
        for y in 0..h {
            let line = (0..w).map(|x| buffer[(x, y)].symbol()).collect::<String>();
            lines.push(if line.contains("PERTH /") {
                line.chars()
                    .map(|c| if c.is_ascii_digit() { '0' } else { c })
                    .collect()
            } else {
                line
            });
        }
        lines.join("\n")
    }
    #[test]
    fn published_content_and_internal_navigation() {
        let app = PortfolioApp::default();
        assert_eq!(app.posts.len(), 1);
        assert_eq!(app.posts[0].slug, "site-and-terminal");
        assert!(app.content.projects[0].link.is_none());
        let rows = app.document();
        let tactify = rows
            .iter()
            .find(|row| row.text.contains("01  Tactify"))
            .unwrap();
        assert!(tactify.action.is_none());
        let site = rows
            .iter()
            .find(|row| row.text.contains("03  This site + the TUI"))
            .unwrap();
        assert_eq!(site.action, Some(Action::Navigate(Page::Post(0))));
        assert!(app.posts.windows(2).all(|p| p[0].date >= p[1].date));
        assert_eq!(app.content.projects.len(), 3);
        assert_eq!(app.content.socials.len(), 7);
        assert_eq!(
            app.resolve("/blog/site-and-terminal/"),
            Action::Navigate(Page::Post(
                app.posts
                    .iter()
                    .position(|p| p.slug == "site-and-terminal")
                    .unwrap()
            ))
        );
        assert_eq!(
            app.resolve("https://austindelic.com/resume.pdf"),
            Action::Resume
        );
        assert_eq!(
            app.resolve("https://github.com/austindelic/still"),
            Action::Open("https://github.com/austindelic/still".into())
        );
        assert!(RESUME.starts_with(b"%PDF"));
    }
    #[test]
    fn focus_links_back_scroll_and_resize() {
        let mut app = PortfolioApp::default();
        render(&mut app, 80, 24);
        app.input(Input::End);
        let scroll = app.scroll;
        assert!(scroll > 0);
        app.navigate(Page::Blog);
        render(&mut app, 80, 24);
        app.focus = 5;
        app.input(Input::Enter);
        assert!(matches!(app.page, Page::Post(_)));
        render(&mut app, 80, 24);
        app.input(Input::Back);
        assert_eq!(app.page, Page::Blog);
        app.input(Input::Back);
        assert_eq!(app.page, Page::Home);
        assert_eq!(app.scroll, scroll);
        render(&mut app, 60, 18);
        assert_eq!(app.page, Page::Home);
        app.input(Input::Help);
        assert!(app.help);
        app.input(Input::Back);
        assert!(!app.help);
    }
    #[test]
    fn external_actions_and_mouse() {
        let mut app = PortfolioApp::default();
        render(&mut app, 120, 40);
        assert_eq!(app.activate(3), Some(Action::Resume));
        assert!(app.actions.contains(&Action::CopyEmail));
        let index = app
            .actions
            .iter()
            .position(|a| *a == Action::CopyEmail)
            .unwrap()
            + 5;
        assert_eq!(app.activate(index), Some(Action::CopyEmail));
        let (r, _) = app.hits.iter().find(|(_, index)| *index == 2).unwrap();
        app.input(Input::Click(r.x, r.y));
        assert_eq!(app.page, Page::Socials);
    }
    #[test]
    fn markdown_contains_content_and_link_actions() {
        let rows=markdown("# Heading\n\nParagraph with [link](https://example.com).\n\n- item\n\n> quote\n\n```rust\nlet x = 1;\n```\n\n![diagram](image.png)",|s|Action::Open(s.into()));
        let all = rows
            .iter()
            .map(|r| r.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        for text in [
            "Heading",
            "Paragraph",
            "item",
            "quote",
            "let x = 1;",
            "diagram",
        ] {
            assert!(all.contains(text), "missing {text}");
        }
        assert_eq!(rows.iter().filter(|r| r.action.is_some()).count(), 2);
    }
    #[test]
    fn sanitizes_escape_sequences() {
        assert_eq!(
            clean("hello\x1b[31m red\x1b[0m\x1b]52;c;ZXZpbA==\x07!", false),
            "hello red!"
        );
        assert_eq!(clean("a\u{009b}b\x00c", false), "abc");
        assert_eq!(clean("one — two → three", true), "one - two -> three");
    }
    #[test]
    fn layouts() {
        for (w, h) in [(60, 18), (80, 24), (120, 40), (160, 50)] {
            for (name, page, ascii) in [
                ("home", Page::Home, false),
                ("post", Page::Post(0), false),
                ("ascii", Page::Socials, true),
            ] {
                let mut app = PortfolioApp::new(ascii);
                app.navigate(page);
                let text = render(&mut app, w, h);
                assert!(!text.contains("Resize terminal"));
                let file = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join(format!("tests/snapshots/{name}-{w}x{h}.txt"));
                if std::env::var_os("UPDATE_SNAPSHOTS").is_some() {
                    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
                    std::fs::write(&file, &text).unwrap();
                }
                assert_eq!(
                    text,
                    std::fs::read_to_string(file)
                        .expect("run UPDATE_SNAPSHOTS=1 cargo test -p tui-core layouts")
                );
            }
        }
    }
    #[test]
    fn panel_text_preserves_artwork_only_outside_text_runs() {
        for terminal_background in [false, true] {
            let expected_bg = if terminal_background {
                Color::Reset
            } else {
                BG
            };
            let bg = CellFrame {
                width: 1,
                height: 1,
                generation: 0,
                cells: vec![Cell {
                    glyph: 'X',
                    rgb: [200, 100, 40],
                }],
            };
            let mut terminal = Terminal::new(TestBackend::new(20, 8)).unwrap();
            terminal
                .draw(|f| {
                    f.render_widget(
                        Block::default().style(Style::default().bg(expected_bg)),
                        f.area(),
                    );
                    paint_background(f, &bg);
                    let panel = Rect::new(1, 1, 18, 6);
                    paint_panel(f, &bg, panel, expected_bg);
                    render_panel_text(
                        f,
                        "A B\n\n界 e\u{301}",
                        Style::default().fg(FG).bg(expected_bg),
                        panel,
                        false,
                    );
                    render_panel_text(
                        f,
                        "Go",
                        Style::default().fg(SELECTED_FG).bg(ACCENT),
                        Rect::new(1, 5, 18, 1),
                        true,
                    );
                })
                .unwrap();
            let b = terminal.backend().buffer();
            assert_eq!(b[(0, 0)].fg, Color::Rgb(200, 100, 40));
            for position in [(4, 1), (1, 2), (5, 3), (18, 6)] {
                assert_eq!(b[position].symbol(), "X");
                assert_eq!(b[position].fg, Color::Rgb(30, 15, 6));
                assert_eq!(b[position].bg, expected_bg);
            }
            assert_eq!(b[(2, 1)].symbol(), " "); // Space within A B is opaque.
            assert_eq!(b[(2, 1)].fg, FG);
            assert_eq!(b[(1, 3)].symbol(), "界");
            assert_eq!(b[(3, 3)].symbol(), " ");
            assert_eq!(b[(4, 3)].symbol(), "e\u{301}");
            for x in 1..19 {
                assert_eq!(b[(x, 5)].bg, ACCENT);
                assert_eq!(b[(x, 5)].fg, SELECTED_FG);
                if x >= 3 {
                    assert_eq!(b[(x, 5)].symbol(), " ");
                }
            }
        }
    }

    #[test]
    fn panels_and_help_repaint_from_original_background() {
        for terminal_background in [false, true] {
            let expected_bg = if terminal_background {
                Color::Reset
            } else {
                BG
            };
            let bg = CellFrame {
                width: 1,
                height: 1,
                generation: 0,
                cells: vec![Cell {
                    glyph: 'X',
                    rgb: [200, 100, 40],
                }],
            };
            let mut app = PortfolioApp {
                terminal_background,
                ..PortfolioApp::default()
            };
            let mut terminal = Terminal::new(TestBackend::new(120, 40)).unwrap();
            for page in [
                Page::Home,
                Page::Blog,
                Page::Post(0),
                Page::Socials,
                Page::Explore,
            ] {
                app.navigate(page);
                terminal.draw(|f| app.render(f, &bg)).unwrap();
                let original = terminal.backend().buffer().clone();
                assert_eq!(original[(0, 0)].bg, expected_bg);
                let padding = if app.page == Page::Explore {
                    (118, 38)
                } else if app.page == Page::Home {
                    (43, 35)
                } else {
                    (23, 35)
                };
                assert_eq!(original[padding].symbol(), "X");
                assert_eq!(original[padding].fg, Color::Rgb(30, 15, 6));
                assert_eq!(original[(119, 39)].fg, Color::Rgb(30, 15, 6));
                assert_eq!(original[(0, 0)].fg, Color::Rgb(200, 100, 40));
                app.help = true;
                terminal.draw(|f| app.render(f, &bg)).unwrap();
                let help = terminal.backend().buffer();
                // Blank help rows must contain source artwork even over page text.
                for x in 22..98 {
                    assert_eq!(help[(x, 3)].symbol(), "X");
                    assert_eq!(help[(x, 3)].fg, Color::Rgb(30, 15, 6));
                }
                app.help = false;
                terminal.draw(|f| app.render(f, &bg)).unwrap();
                for y in 0..40 {
                    if y == 3 {
                        continue;
                    } // The wall clock may tick between draws.
                    for x in 0..120 {
                        assert_eq!(terminal.backend().buffer()[(x, y)], original[(x, y)]);
                    }
                }
            }
            // A fresh render and a reused terminal must agree after scrolling/resizing.
            app.navigate(Page::Post(0));
            app.scroll = 10;
            terminal.backend_mut().resize(80, 24);
            terminal.resize(Rect::new(0, 0, 80, 24)).unwrap();
            terminal.draw(|f| app.render(f, &bg)).unwrap();
            let mut fresh = Terminal::new(TestBackend::new(80, 24)).unwrap();
            fresh.draw(|f| app.render(f, &bg)).unwrap();
            for y in 0..24 {
                if y == 3 {
                    continue;
                }
                for x in 0..80 {
                    assert_eq!(
                        terminal.backend().buffer()[(x, y)],
                        fresh.backend().buffer()[(x, y)]
                    );
                }
            }
        }
    }

    #[test]
    fn tiny_terminal_and_background_do_not_overlap() {
        let mut app = PortfolioApp::default();
        assert!(render(&mut app, 30, 10).contains("Resize terminal"));
        let mut terminal = Terminal::new(TestBackend::new(120, 40)).unwrap();
        let bg = CellFrame {
            width: 1,
            height: 1,
            generation: 0,
            cells: vec![Cell {
                glyph: 'X',
                rgb: [255, 0, 0],
            }],
        };
        terminal.draw(|f| app.render(f, &bg)).unwrap();
        let b = terminal.backend().buffer();
        assert_eq!(b[(0, 0)].symbol(), "X");
        assert_eq!(b[(0, 0)].fg, Color::Rgb(255, 0, 0));
        assert_ne!(b[(45, 6)].fg, Color::Rgb(255, 0, 0));
        // Inspect composed cells, including cleared overlays and blank padding.
        for terminal_background in [false, true] {
            app.terminal_background = terminal_background;
            let expected_bg = if terminal_background {
                Color::Reset
            } else {
                BG
            };
            for (w, h) in [(30, 10), (60, 18), (80, 24), (120, 40)] {
                let mut terminal = Terminal::new(TestBackend::new(w, h)).unwrap();
                for page in [
                    Page::Home,
                    Page::Blog,
                    Page::Post(0),
                    Page::Socials,
                    Page::Explore,
                ] {
                    app.navigate(page);
                    for help in [false, true] {
                        app.help = help;
                        terminal.draw(|f| app.render(f, &bg)).unwrap();
                        let buffer = terminal.backend().buffer();
                        assert_eq!(buffer[(0, 0)].bg, expected_bg);
                        if w >= 60 {
                            assert_eq!(buffer[(0, 0)].symbol(), "X");
                            assert_eq!(buffer[(0, 0)].fg, Color::Rgb(255, 0, 0));
                        }
                        for cell in &buffer.content {
                            assert!(cell.bg == expected_bg || cell.bg == ACCENT);
                            if cell.bg == ACCENT {
                                assert_eq!(cell.fg, SELECTED_FG);
                            }
                        }
                    }
                }
            }
        }
    }
}
