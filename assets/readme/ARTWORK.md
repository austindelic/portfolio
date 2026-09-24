# Profile artwork

`masthead.webp` was generated with the built-in imagegen tool, using the existing
`apps/portfolio/public/images/black-hole-mobile.webp` as a style reference.
The original PNG was exported to WebP at quality 94 without cropping or resizing.
This is illustrated profile artwork, not a screenshot of the renderer.

The four SVG icons are hand-authored, self-contained pixel geometry. They use the
portfolio's black, silver, and orange palette and need no fonts or external assets.
Attribution for the application's shaders remains alongside their source files.

## Generation prompt

```text
Use case: stylized-concept
Asset type: finished panoramic GitHub profile masthead, landscape 3:1 aspect ratio, ideally 1800x600.
Create an exceptionally art-directed typographic banner for software engineer AUSTIN DELIC.
Input image: reference for the amber ASCII black-hole aesthetic only, not a layout to copy.
Composition: deep almost-black rectangular canvas. Left 55% carries huge two-line silver-white pixel monospace typography, first line "AUSTIN", second line "DELIC" with a small solid orange square period beside it. The letterforms evoke Departure Mono: rigorous squared terminals and deliberate pixel steps, readable and beautifully kerned. Name should occupy most of banner height with generous 50px safe margins. Right 45% is an enormous dramatic black hole made entirely of crisp sparse amber/orange ASCII-like glyphs and small pixel clusters, hot accretion disk sweeping horizontally and gravitational lens arc above and below a perfectly black void. A few glyphs fade across the boundary towards the type, without obscuring the letters. The black hole extends off the right canvas edge slightly. More editorial print composition than game UI.
Palette: black #08090B, warm silver #E1E1D9, orange #FFA133; occasional dim brown/gold ASCII marks. No blue or purple.
Minor technical markings: only a fine broken orange baseline near bottom and two very small crosshair registration marks at the corners. A tiny readable "PERTH / AU" at top-left and "SOFTWARE + SYSTEMS" at bottom-left. Main name overwhelmingly larger than micro labels.
Texture: mostly flat crisp digital image with very subtle grain. Not photoreal. No chrome, glossy 3D type, robots, circuit boards, dashboards, badges, fake code, mountains, lens flares, rounded panels, watermarks, gradients behind text, excessive starfield or extra words.
Text exact: AUSTIN, DELIC, PERTH / AU, SOFTWARE + SYSTEMS. Spell DELIC as D E L I C.
Final asset must look strong and legible both at 900px desktop display width and 343px mobile display width. Preserve thick letter strokes. This is one finished production banner, not a mockup or contact sheet.
```
