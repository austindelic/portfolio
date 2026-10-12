# TNS wallpaper collection — 324 designs

Three styles (filled, contour, disintegrate), three sizes (compact, medium, oversized), two artwork positions (original, centred), nine text placements and two palettes (light, dark). All 324 designs are distinct. Earlier wallpaper folders are preserved.

`4k/` contains 324 native 3840 × 2160 PNGs. `1080p/` contains their 324 downsampled 1920 × 1080 companions. `editable/` contains 324 SVGs made from actual Departure Mono text. Filenames identify style, size, artwork position, text placement and mode. `index.csv` maps every design to its files.

`overview-all-324.png` shows every design, with light/dark pairs stacked in each cell. `artwork-matrix.png` shows all 18 artwork presets with the text in the brace gap, paired light/dark. `comparisons/` contains 18 larger sheets; each shows all nine text placements for one artwork preset in both modes.

The light and dark ZIPs each contain 162 designs in both resolutions, their editable SVGs, shared comparison sheets, character layouts, configuration, source and verification results. Shared comparison sheets show both palettes for comparison. No font binaries are included.

All artwork uses actual Departure Mono Regular characters. Disintegration affects only the opening brace and its leftward particles. Its closing brace matches the filled version's character records and rendered pixels. Text is exactly “the next {something}”. Text sizes are 48/64/80 px by artwork size. Fixed edge positions have 160 px margins measured from visible glyph bounds; text overlapping artwork has a 3 px background-coloured outline. SVG stroke widths are 6 px because SVG strokes straddle the glyph boundary. Only the oversized geometry intentionally clips brace tips.

Run from the repository using `python3 assets/wallpapers/tns-desktop/collection/render.py`, or `python3 assets/wallpapers/tns-desktop/render.py --collection`. Requires Pillow and NumPy. The fixed seed, exact font hash, real glyphs, placement bounds, repeat renders, closing-brace equality, paired modes, unique images, export dimensions, SVG text and ZIP integrity are checked by the renderer. Recheck existing exports with `--check-only`; rebuild the ZIPs with `--package-only`.

For an extracted ZIP, set `TNS_DEPARTURE_FONT` to the repository's exact `DepartureMono-Regular.woff2` file before running `python3 render.py`. The reused banner source is included in `banner-source/`. Editable SVGs require Departure Mono installed locally. No AI generation or trial fonts are used. These are local artifacts; desktop settings are not changed.
