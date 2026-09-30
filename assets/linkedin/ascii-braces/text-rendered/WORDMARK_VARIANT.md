# Lofi wordmark with Departure Mono disintegration

This additional private evaluation variant uses **Lofi Forest Trial / Pixel** for the black words `the next` and `something`. The two blue braces in the right wordmark retain their original Departure Mono artwork, position and pixels. The left ASCII effect is the existing Departure Mono Disintegrate design, unchanged. The launch line and logos also retain their original pixels.

Outputs are in `trial-previews/lofi-wordmark-departure-disintegrate/`:

- `lofi-wordmark-departure-disintegrate-1584x396.png`
- `lofi-wordmark-departure-disintegrate-6336x1584.png`
- `comparison.png`, showing the original and new wordmarks
- `lofi-wordmark-text.svg`, containing the two editable word groups only
- `departure-disintegrate-text.svg`, containing the editable left ASCII artwork
- `verification.json`, recording font identities, layout and preservation checks
- `private-wordmark-variant.zip`, containing both PNGs, text sources and rendering inputs

Set `TNS_LOFI_FONT` to the supplied official `LofiForestTrial-Pixel.ttf` outside the repository, then run:

```sh
python3 assets/linkedin/ascii-braces/text-rendered/render_wordmark_variant.py
```

`wordmark-variant.json` holds the layout and typeface choices. Both sizes render real font characters directly. The script verifies repeat-render equality, decoded PNG dimensions, exact preservation of the wordmark braces, and equality to the existing Departure artwork. It also checks every pixel outside the two word replacement regions remains unchanged.

When reproducing an extracted ZIP, update `config.json` to use your local font paths, then run `python3 render_wordmark_variant.py` from its root. SVGs reference the exact font face by name; they contain no embedded font binary.

The trial previews remain local and excluded from Git, consistent with [Kilotype's trial terms](https://kilotype.de/licensing#trial). Earlier banner variants are preserved.
