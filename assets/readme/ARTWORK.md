# README artwork

The masthead is the user-selected middle placement variation, generated with the
built-in image_gen tool from the approved side-profile Navara banner. The ute
faces left and bridges “Austin” and “Delic.” The vehicle design was originally
developed from Austin's two photos of his white 2014 D22 Navara. The portfolio strip remains an actual capture of
this project's WebGL2 ASCII-cell renderer.

## Source and provenance

`source/black-hole.webp` is a cropped, downsampled copy of the native 5280 × 5280
capture made for the **Create ISPO LinkedIn banner** task. The original file was
`assets/linkedin/hires/black-hole-native-5280.png` in that task's checkout.
`source/capture.json` records the original SHA-256, camera, shader time, glyph
settings, crop bounds, and stored dimensions. The checked-in lossless WebP is
sufficient to reproduce the portfolio strip without that other checkout.

The composition preserves the captured glyphs and colors; it crops and scales the
image and lifts the black floor to the README's charcoal background. It does not
paint or synthesize new black-hole detail. Shader credits remain with the
[shared renderer source](../../packages/black-hole/).

The Still illustration represents connected environment layers. Tactify uses an
abstract dot diagram and audio waveform. These are geometric illustrations,
not screenshots of those products or Braille text.

### Selected word-gap Navara masthead

The user explicitly requested image generation after reviewing the authored vector
versions. `source/navara-word-gap.webp` is the selected generated banner, encoded
as WebP at quality 95. Its composition and typography are those produced by the
image tool: no cropping, stretching, retouching, or text replacement was applied.
The native output is 2172 × 724 (3:1), displayed responsively in the README.

The original vehicle photo references were `IMG_4651.PNG` and `IMG_4652.PNG`;
the original photographs remain outside the repository. The approved side-profile
banner supplied the vehicle style, name,
role, location and palette for this placement edit. Three alternatives were
generated independently; the user selected the middle option, bridging the word
gap. This saved output is used as selected, without subsequent placement edits.
This is a generated illustration, not a dimensionally exact drawing or a photograph
of the vehicle.

- `source/navara-word-gap-prompt.txt` records the exact placement-generation prompt.
- `source/navara-word-gap.json` records the tool, reference names, original output
  hash, dimensions and compression settings.
- The original generated PNG remains in Codex's generated-images directory;
  the checked-in optimized source is sufficient to reproduce the served asset.

### Transparent masthead edit (draft)

The README now references `masthead-navara-word-gap-transparent.webp`, an imagegen
background-removal edit of the approved banner. The original opaque source and
display asset remain available for comparison. The new source is
`source/navara-word-gap-transparent.webp`, encoded as lossless RGBA WebP at the
original 2172 × 724 dimensions. Its JSON sidecar records the exact prompt,
generation output hash, encoding, and review status.

**Not ready to merge:** the generated background is genuinely transparent, but
edge halos and stray pixels remain around the lettering and truck. Clean edges
and fidelity to the original foreground still require visual approval.

`render.py` validates the dimensions and presence of transparent and opaque pixels,
then copies the transparent source byte-for-byte to the display asset. It never
flattens alpha or reruns image generation. The fresh filename avoids cached copies
of the opaque banner on GitHub. Still connectors stop at the final card.

## Rebuild

Run from the repository root with Python and Pillow available:

```sh
python3 assets/readme/render.py
```

Verified with Pillow 12.3.0. The script uses the existing
`apps/portfolio/public/fonts/DepartureMono-Regular.woff2` font through FreeType;
the Pillow build must support WOFF2. It does not add a dependency to the app.

`render.py` copies the saved masthead and rebuilds the project strips and four
standalone SVG icons. It produces:

- `masthead-navara-word-gap-transparent.webp` — 2172 × 724, RGBA with transparency.
- `portfolio.webp`, `still-environment.webp`, `tactify.webp` — 1800 × 220 each.
- `browser.svg`, `terminal.svg`, `systems.svg`, `tactile.svg` — transparent 24px icons.

Project-strip lettering is rasterized with the actual Departure Mono font; the
masthead lettering is generated from the prior banner reference. GitHub does not
need to load web fonts. Icons use a shared 24px grid and two-pixel strokes. Project
descriptions, technology lists, and links remain selectable text in the README.

Palette: charcoal `#0d1117`, warm white `#e6e3db`, amber `#ffa133`, and muted
gray `#9da6b2`. All assets are static and served from this repository. The
optional Spotify embed remains an external service.

The transparent source and display asset are each 266,866 bytes. Rebuilding the
masthead copies the source without changing any decoded pixels or alpha values.

## Transparent edit verification

The lossless WebP decoded identically to the generated PNG, including alpha.
Rebuilding the masthead produced a byte-identical copy. Background corner and
empty-canvas samples have alpha 0; a wheel sample retains alpha 253/255.

A local preview using the README's actual masthead HTML passed Playwright checks
at 1280px and 390px: the image loaded at 2172 × 724, the corner remained transparent,
and there was no horizontal overflow, page error, console error, or failed request.
The dark rectangular backdrop is gone. Visual inspection still found foreground
edge artifacts, so these technical checks do not establish merge readiness.
This focused preview is not a live GitHub profile or full Markdown rendering.

## Previous layout verification

The README was rendered through GitHub's Markdown API and previewed locally with
GitHub-style Markdown CSS. Playwright checks passed at 1280px, 390px, and 320px
viewport widths in dark and light themes: all images loaded, the requirements
and setup disclosures opened, and neither collapsed nor expanded content
overflowed. The preview had no page errors or failed network requests. This is
a local preview of GitHub-rendered content, not a published profile update.
