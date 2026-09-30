# TNS ASCII brace banners

Six blue ASCII `{}` treatments replace the black hole in the original TNS LinkedIn banner. Every finished banner has a 4:1 aspect ratio. The wordmark, launch line and YC/a16z logos use the original artwork at its original proportional position; their pixels are checked against a common resized branding plate.

Open [the labelled comparison sheet](comparison-1664x3020.png) to compare all six.

| Variant | LinkedIn export | Larger master |
| --- | --- | --- |
| Clean | [1584 × 396](linkedin/01-clean-1584x396.png) | [2172 × 543](masters/01-clean-2172x543.png) |
| Oversized | [1584 × 396](linkedin/02-oversized-1584x396.png) | [2048 × 512](masters/02-oversized-2048x512.png) |
| Tilted | [1584 × 396](linkedin/03-tilted-1584x396.png) | [2172 × 543](masters/03-tilted-2172x543.png) |
| Perspective | [1584 × 396](linkedin/04-perspective-1584x396.png) | [2204 × 551](masters/04-perspective-2204x551.png) |
| Trails | [1584 × 396](linkedin/05-trails-1584x396.png) | [2172 × 543](masters/05-trails-2172x543.png) |
| Dissolve | [1584 × 396](linkedin/06-dissolve-1584x396.png) | [2172 × 543](masters/06-dissolve-2172x543.png) |

The oversized version intentionally clips the upper and lower brace tips. All other versions retain the full brace silhouettes. Artwork stays on the left, with an empty centre and space before the wordmark.

## Sources and export

The artwork was created with the **built-in image_gen tool**, in six independent edit calls using the original banner. Exact prompts are saved in [prompts.json](prompts.json). Unmodified generated outputs and the original 6336 × 1584 reference are retained in `sources/`; their actual dimensions are recorded in [verification.json](verification.json).

The tool returned wider-than-tall images with differing canvas proportions. `export.cjs` packages their left-side artwork into a 4:1 layout without stretching the characters, then places the original branding in its original proportional position. Larger masters use the generated image width (rounded down to a multiple of four), rather than claiming new artwork at the original reference's 6336-pixel resolution.

Re-export with Node.js and installed `sharp`, or set `SHARP_MODULE` to an existing absolute sharp package path:

```sh
node assets/linkedin/ascii-braces/export.cjs
```

Export verification fully decodes all twelve finished PNGs, checks dimensions, compares master and LinkedIn branding pixels, and confirms the original reference hash is unchanged. The comparison sheet and individual LinkedIn outputs were visually inspected for legibility, spacing, brace shape and black-hole removal.
