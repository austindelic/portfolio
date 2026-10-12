# TNS desktop wallpaper concepts

Three concepts, each with light and dark palettes:

1. **Disintegrate** — an opening brace dissolves into characters to the left, with an intact closing brace. Artwork sits to the right, leaving room for desktop icons on the left.
2. **Contour** — hollow brace shapes traced in real ASCII characters. A small TNS wordmark anchors the opposite corner.
3. **Monument** — large, subdued braces crop into the screen edges and frame the TNS wordmark.

`comparison.png` shows all six designs. `4k/` contains native **3840 x 2160** PNGs; `1080p/` contains **1920 x 1080** downsampled versions. `editable/` contains actual SVG text and reproducible character layouts. The ZIP includes all exports, source code and configuration.

All typography and artwork use real **Departure Mono Regular** glyphs. Light mode uses the original #245bff blue; dark mode uses #7999ff and stronger character opacity for visibility on #0b101a. Paired modes have identical geometry. No AI generation, trial fonts, launch claims or partner logos are used.

Render from this repository with the bundled Python runtime: `python3 assets/wallpapers/tns-desktop/render.py`. The renderer reuses the existing ASCII banner algorithm and repository font file. SVGs require Departure Mono locally. No font files are packaged. Files are prepared locally; desktop settings are not changed.
