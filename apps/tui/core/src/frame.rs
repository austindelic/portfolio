#[derive(Clone, Debug, Default)]
pub struct Cell {
    pub glyph: char,
    pub rgb: [u8; 3],
}
#[derive(Clone, Debug, Default)]
pub struct CellFrame {
    pub width: u16,
    pub height: u16,
    pub generation: u64,
    pub cells: Vec<Cell>,
}
