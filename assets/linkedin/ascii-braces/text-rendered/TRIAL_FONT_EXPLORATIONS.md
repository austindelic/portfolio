# Three-font private banner exploration

**385 additional designs**, using 55 trial font faces and all seven existing Departure Mono ASCII effects. Every design includes directly rendered **1584 × 396** and **6336 × 1584** PNGs.

The supplied trial fonts replace only the black words `the next` and `something`. The original blue wordmark braces, launch line and logos retain their exact pixels. The left artwork uses Departure Mono throughout.

| Family | Styles sampled | Designs |
|---|---|---:|
| MD Thermochrome 0.5 Trial | All 40 supplied desktop faces: eight weights across Regular, Italic, Retalic, Reclined and Inclined | 280 |
| Electric Blue Trial | All 10 supplied desktop OTF instances, including Regular Apart | 70 |
| Trial MetamorBit | Width axis 200, 300, 400, 500 and 600 | 35 |

Each face is paired with Clean, Oversized, Tilted, Perspective, Trails, Dissolve and Disintegrate. The large blue closing brace remains intact in Disintegrate, as in the existing Departure design. Font sizes fit the two existing word regions while preserving natural character proportions, a common baseline and a common size for both groups within each design.

Outputs are under `trial-previews/three-trial-font-explorations/`. Start with `overview.png`, then the eight paginated font comparison sheets in `comparisons/`. Each of the 55 face folders has an `effects-comparison.png`, two PNG sizes for each effect, an editable `wordmark-text.svg`, and `face.json` recording the exact font source, identity, hash, variation coordinates and layout. `common/` contains editable Departure Mono effect SVGs. The font comparison sheets keep Disintegrate constant so differences between typefaces are easy to compare.

There are separate private preview ZIPs for Thermochrome, Electric Blue and MetamorBit. They contain no font binaries. All preview outputs stay outside Git and are for private evaluation; no website, public API or hosting changes are included.

The thinnest faces are deliberately faint at LinkedIn size; their Light, Regular and heavier companions make stronger wordmarks. MetamorBit's supplied default style draws uppercase forms even for the original lowercase text string.

Comparison pages:

- [Thermochrome Inclined](comparisons/thermochrome-page-01.png)
- [Thermochrome Italic](comparisons/thermochrome-page-02.png)
- [Thermochrome Reclined](comparisons/thermochrome-page-03.png)
- [Thermochrome Regular](comparisons/thermochrome-page-04.png)
- [Thermochrome Retalic](comparisons/thermochrome-page-05.png)
- [Electric Blue, first eight faces](comparisons/electric-blue-page-01.png)
- [Electric Blue, remaining faces](comparisons/electric-blue-page-02.png)
- [MetamorBit width variations](comparisons/metamorbit-page-01.png)

To reproduce, keep the supplied archives in Downloads or change their paths in `trial-font-explorations.json`, then run `python3 assets/linkedin/ascii-braces/text-rendered/render_trial_font_explorations.py` from the repository. The renderer uses Pillow 12.3.0 and NumPy 2.3.5 from the existing runtime. Trial font bytes are loaded directly from the archives without installing, modifying or copying the font files into the repository.

The ZIPs also include rendering code, configuration and the original banner inputs. For an extracted ZIP, update the Departure Mono font path in `config.json` to an absolute path on your machine, then run `python3 render_trial_font_explorations.py` from its root with all three supplied trial archives available.

Verification covers font identity, required text glyphs, declared variable-axis bounds, unique face IDs, text fitting, repeated wordmark rendering, decoded PNG sizes and pixels, exact preservation outside the word replacement regions, and intact wordmark braces. ZIPs are tested for corruption, correct PNG counts and font-binary exclusion. `verification.json` records all 385 designs.

Font name references follow the [OpenType name table](https://learn.microsoft.com/en-us/typography/opentype/spec/name); variable widths use Pillow's documented variation-axis API and the font's supplied Width axis.
