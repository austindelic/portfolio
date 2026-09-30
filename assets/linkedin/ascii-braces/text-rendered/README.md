# TNS banners made from real font characters

The left artwork is built entirely from actual text glyphs. Each large brace silhouette comes from the selected font's `{` or `}` glyph and is filled with independently positioned ASCII characters from that same font. Fixed seeds reproduce the character layouts, particles and opacity exactly. No generated images are read or used.

## Designs

Each font has **Clean, Oversized, Tilted, Perspective, Trails, Dissolve, and Disintegrate** versions. Disintegrate gradually increases retention and opacity from left to right across the opening `{`, shedding characters toward the left. Its closing `}` is pixel-identical to Clean at both export sizes.

Finished sets:

- [Menlo comparison](finished/menlo/comparison.png)
- [Departure Mono comparison](finished/departure-mono/comparison.png)
- [Maple Mono comparison](finished/maple-mono/comparison.png)
- [Disintegrate font comparison](finished/disintegrate-font-comparison.png)
- [Finished banner ZIP](tns-real-text-banners.zip)

Every design includes a **1584 × 396 PNG**, a **6336 × 1584 PNG**, an editable artwork SVG containing real `<text>` elements, and a JSON file recording every character and its position, opacity and role. Both PNG sizes draw the font characters directly at the output resolution. The original wordmark, launch line and logos are copied from the original branding plate and verified without changing their proportional positions.

SVGs contain the left artwork only, with transparent backgrounds. They reference the named font rather than embedding it; the exact font must be available in the editing application. Font identities and SHA-256 hashes are recorded alongside each set. Menlo and Maple Mono use installed files; Departure Mono uses the repository WOFF2 file. Font binaries are not included in the packages.

## Lofi Forest Pixel trial

All **28 designs** have been rendered, including seven private previews using the supplied official `LofiForestTrial-Pixel.ttf` file. Its actual font identity is **Lofi Forest Trial / Pixel**. The trial font was extracted outside this repository. To reproduce its previews, set `TNS_LOFI_FONT` to that font's absolute path, then rerun the renderer. The renderer checks the face identity and required glyphs, failing rather than substituting another typeface. Without that environment variable, the renderer intentionally renders only the 21 installed-font designs and records the missing trial font.

The Lofi Forest outputs go in `trial-previews/` and `lofi-forest-private-previews.zip`. They are for private evaluation, not final/public or commercial use, as required by [Kilotype's trial terms](https://kilotype.de/licensing#trial). Font files remain outside Git and all packages.

- [Lofi Forest Pixel comparison](trial-previews/lofi-forest-pixel/comparison.png)
- [Four-font Disintegrate comparison](trial-previews/disintegrate-all-fonts-comparison.png)
- [Private trial preview ZIP](lofi-forest-private-previews.zip)

The trial preview folder and ZIP are ignored by Git to keep these evaluations local.

Lofi uses 12-pixel characters on a 6 × 9 grid rather than the baseline 8-pixel characters on a 4.5 × 7.5 grid. This keeps its fine Pixel letter detail readable at LinkedIn size. Both resolutions render those glyphs directly; the large brace layout remains the same.

## Reproduce and verify

Use Python with Pillow 12.3.0 and NumPy 2.3.5. The checked desktop runtime already supplies both. Configuration is in `config.json`; specify actual local font paths there when running on another machine.

The ZIP includes this guide, configuration, rendering code, tests and the unchanged source banner. To render from an extracted ZIP, update the font paths in `config.json`, then run `python3 render.py` and `python3 -m unittest discover -p 'test_*.py'` from its root. The SVG text uses the same font identities as the PNGs; no font binaries are packaged.

```sh
python3 assets/linkedin/ascii-braces/text-rendered/render.py
python3 -m unittest discover -s assets/linkedin/ascii-braces/text-rendered -p 'test_*.py'
```

`verification.json` records completed designs and missing trial fonts. Export checks fully decode PNGs, validate dimensions and branding, prove the original hash is unchanged, and compare the closing brace with Clean. Tests also check missing/wrong font rejection, repeat-render equality, directional fading and editable text sources. ZIP contents are verified byte-for-byte against the files on disk.
