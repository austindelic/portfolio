# README artwork

The masthead and portfolio strip use an actual capture of this project's WebGL2
ASCII-cell renderer. They replace the previous AI-generated masthead. No image
generation is used in the current artwork.

## Source and provenance

`source/black-hole.webp` is a cropped, downsampled copy of the native 5280 × 5280
capture made for the **Create ISPO LinkedIn banner** task. The original file was
`assets/linkedin/hires/black-hole-native-5280.png` in that task's checkout.
`source/capture.json` records the original SHA-256, camera, shader time, glyph
settings, crop bounds, and stored dimensions. The checked-in lossless WebP is
sufficient to reproduce every README asset without that other checkout.

The composition preserves the captured glyphs and colors; it crops and scales the
image and lifts the black floor to the README's charcoal background. It does not
paint or synthesize new black-hole detail. Shader credits remain with the
[shared renderer source](../../packages/black-hole/).

The Still illustration represents connected environment layers. Tactify uses an
abstract dot diagram and audio waveform. These are geometric illustrations,
not screenshots of those products or Braille text.

The masthead and Still strip use new filenames to avoid cached copies of the
previous images on GitHub. Still connectors stop at the final card.

## Rebuild

Run from the repository root with Python and Pillow available:

```sh
python3 assets/readme/render.py
```

Verified with Pillow 12.3.0. The script uses the existing
`apps/portfolio/public/fonts/DepartureMono-Regular.woff2` font through FreeType;
the Pillow build must support WOFF2. It does not add a dependency to the app.

`render.py` is the editable source for placement, typography, colors, geometric
illustrations, and the four standalone SVG icons. It produces:

- `masthead-rendered.webp` — 1800 × 450.
- `portfolio.webp`, `still-environment.webp`, `tactify.webp` — 1800 × 220 each.
- `browser.svg`, `terminal.svg`, `systems.svg`, `tactile.svg` — transparent 24px icons.

Departure Mono is rasterized with the actual font, so GitHub does not need to
load web fonts. Icons use a shared 24px grid and two-pixel strokes. Project
descriptions, technology lists, and links remain selectable text in the README.

Palette: charcoal `#0d1117`, warm white `#e6e3db`, amber `#ffa133`, and muted
gray `#9da6b2`. All assets are static and served from this repository. The
optional Spotify embed remains an external service.

The display assets total 190,355 bytes; including the reusable source image,
all image assets total 593,331 bytes. Rebuilding with the verified environment
produces identical files.

## Layout verification

The README was rendered through GitHub's Markdown API and previewed locally with
GitHub-style Markdown CSS. Playwright checks passed at 1280px, 390px, and 320px
viewport widths in dark and light themes: all images loaded, the requirements
and setup disclosures opened, and neither collapsed nor expanded content
overflowed. The preview had no page errors or failed network requests. This is
a local preview of GitHub-rendered content, not a published profile update.
