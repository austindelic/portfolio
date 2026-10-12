# TNS split wordmark

Matches the screenshot's filled, medium, original-position ASCII brace artwork. “the next” sits outside the opening brace with a 96 px gap; “something” is centred inside the large brace pair. Both pieces retain the original wordmark's exact 64 px Departure Mono font and baseline. The large ASCII braces supply the punctuation; no small inline braces are added.

Dark and light versions are provided as 3840 × 2160 PNGs, 1920 × 1080 PNGs, and editable SVGs. `comparison.png` shows the pair. The ZIP includes all exports, font-free character layouts, configuration, rendering source and verification results. Earlier versions and the 324-design collection remain preserved.

Render with `python3 assets/wallpapers/tns-desktop/split-wordmark/render.py`. Requires Pillow and NumPy, and reuses the collection renderer. From an extracted ZIP, set `TNS_DEPARTURE_FONT` to the exact repository DepartureMono-Regular.woff2 file and run `python3 render.py`. SVGs require Departure Mono installed locally. No fonts are packaged, no AI generation is used, and desktop settings are not changed.
