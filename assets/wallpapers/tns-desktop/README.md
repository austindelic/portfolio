# TNS desktop wallpaper concepts

Three concepts, each with light and dark palettes:

The expanded **`collection/`** contains 324 distinct designs: all three brace styles at all three sizes, original and centred artwork, nine text placements and both modes. See its README, CSV index, complete overview, 18 detailed comparison sheets, and separate light/dark ZIPs. Run `python3 assets/wallpapers/tns-desktop/render.py --collection` to rebuild it. The earlier six-design sets below remain preserved.

**`split-wordmark/`** adds the screenshot-matched layout with “the next” outside the opening brace and “something” inside the large pair, on the original text baseline. It includes matching dark/light exports, editable source, and a ZIP.

The latest exports are in **`brace-gap/`**. The brace silhouettes stay centred on the desktop, with the wordmark aligned to the horizontal gap between their middle tips. Placement checks use the visible glyph bounds. Earlier compositions remain in the original folders and `centred/`.

1. **Disintegrate** — an opening brace dissolves into characters to the left, with an intact closing brace.
2. **Contour** — hollow brace shapes traced in real ASCII characters.
3. **Monument** — large, subdued braces crop into the screen edges and frame the TNS wordmark.

`brace-gap/comparison.png` shows all six revised designs. Within `brace-gap/`, `4k/` contains native **3840 x 2160** PNGs; `1080p/` contains **1920 x 1080** downsampled versions. `editable/` contains actual SVG text and reproducible character layouts. The new ZIP includes all revised exports, source code and configuration.

All typography and artwork use real **Departure Mono Regular** glyphs. Light mode uses the original #245bff blue; dark mode uses #7999ff and stronger character opacity for visibility on #0b101a. Paired modes have identical geometry. No AI generation, trial fonts, launch claims or partner logos are used.

Render from this repository with the bundled Python runtime: `python3 assets/wallpapers/tns-desktop/render.py`. The renderer reuses the existing ASCII banner algorithm and repository font file. SVGs require Departure Mono locally. No font files are packaged. Files are prepared locally; desktop settings are not changed.

## Text aligned with the brace gap

The `brace-gap/` revision keeps the brace silhouettes centred and moves the wordmark to the horizontal gap between their middle tips. Previous exports in `centred/` are preserved. Each light/dark pair shares the same placement. Its ZIP includes 4K and 1080p PNGs, editable SVGs, configuration, rendering source, and verification results.
