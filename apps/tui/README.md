# Austin Delic — terminal portfolio

A native terminal CLI with the website's content and GPU black hole, rendered as actual terminal characters. Ratatui and Crossterm handle the terminal; `wgpu` runs the website's WGSL shaders offscreen through Metal, Vulkan or DirectX 12. There is no window, browser, or Bevy runtime.

## Install and run

After npm publication, run `npx austindelic` with Node 22 or newer. The standalone distribution lives in `npm/` and bundles five native targets.

From this repository, with a current Rust toolchain:

```sh
cargo install --path apps/tui/cli --locked
austindelic
```

For development:

```sh
cd apps/tui
cargo run -p austindelic
cargo run -p austindelic -- --renderer static
```

Content, published blog posts, shaders, glyph metrics, static artwork, and the resume PDF are embedded. No network or repository is needed at runtime. External links and the resume use the platform default application only when activated. Copy email uses the system clipboard through `arboard`.

The local CLI supports macOS Metal, Linux Vulkan and Windows DirectX 12. Automatic mode starts with a static black hole and keeps it if graphics initialization fails. The app runs locally and is distributed through npm; no application server is required. The website remains on Cloudflare Pages.

## Terminal setup

Install [Departure Mono](https://departuremono.com/) and select it in your terminal's font preferences. A CLI cannot choose the host terminal's font. Any monospace font works; no Nerd Font is required. Use a true-colour terminal for the intended pure-black background, silver, orange, and shader colours. `NO_COLOR` is respected by the terminal backend.

```sh
austindelic --renderer auto --fps 30
austindelic --renderer gpu             # fail clearly if graphics cannot initialize
austindelic --renderer static          # never initialize the GPU
austindelic --no-animation             # render on demand; no autonomous motion
austindelic --ascii                    # ASCII borders and labels
austindelic --cell-aspect 0.5           # character width / height
```

The terminal's reported pixel dimensions determine cell aspect where available; otherwise it defaults to 0.5. FPS accepts 1–60, aspect accepts 0.2–2.0. Minimum size is 60 columns × 18 rows. Home moves to the right at 120 columns. Smaller screens scroll full-width content. The animation grid is capped at 240×80 cells.

## Controls

| Action | Controls |
| --- | --- |
| Focus navigation and links | Tab / Shift-Tab |
| Select navigation | Left / Right |
| Activate focused item | Enter; or mouse click |
| Scroll | Up / Down, j / k, mouse wheel |
| Long-page navigation | PageUp / PageDown, Home / End |
| Back / close overlay | Esc |
| Help | ? |
| Quit | q outside Explore; Ctrl-C everywhere |
| Explore movement | WASD; R / F rise and descend |
| Explore look | IJKL or mouse drag |
| Explore roll | Q / E |
| Movement speed | Up / Down |
| Pause / reset | Space / 0 |
| Render resolution | 9 decrease / 8 increase; 0.5x, 1x, 2x, 4x |
| Time / exposure / bloom | [ / ], - / +, comma / period |

Explore is entered through the navigation bar. Render resolution changes the GPU image before ASCII conversion, leaving character density unchanged. The current scale and pixel dimensions appear in Explore. It defaults to 1x, persists across pages during the session, and returns to 1x with 0 reset. In static mode it displays the fallback and explains that camera controls require the GPU. External actions report success or failure in the footer. Markdown links and images are listed as selectable actions at the end of each article. Use your terminal's selection override (typically Shift-drag) to select text while mouse capture is enabled.

## Source and assets

- `core`: content, Markdown presentation, navigation, terminal composition.
- `cli`: terminal lifecycle, events, platform actions, and renderer orchestration.
- `renderer`: graphics device, six website shader passes, triple-buffered asynchronous cell readback, latest-value worker mailboxes, and authored route cameras.
- `npm`: standalone public package and native executable launcher.

Shared shaders, their uniform layout, and camera presets live in `packages/black-hole`. Canonical profile/project/social records remain in the portfolio application's `src/data`. Astro imports graphics assets from `@repo/black-hole` and reads content directly. Blog Markdown remains under `src/content/blog`. The TUI build parses frontmatter, excludes `published: false`, and embeds posts newest first.

```sh
node apps/tui/scripts/sync-assets.mjs
node apps/tui/scripts/sync-assets.mjs --check
```

Sync copies shared graphics assets and website content/resume into embedded TUI assets, removes obsolete post copies, and records SHA-256 hashes. Run it before building after content changes. Committed package assets let `cargo install --path apps/tui/cli` build without Node or a running website.

Departure Mono metrics were generated from the actual website rasterizer in Chromium. To recalibrate after changing the font, glyph set, or rasterizer, start the Astro dev server at `http://127.0.0.1:4321` and run:

```sh
npx --yes --package @playwright/cli playwright-cli -s=tui open http://127.0.0.1:4321/
npx --yes --package @playwright/cli playwright-cli --raw -s=tui run-code --filename=apps/tui/scripts/glyph-metrics.js > /tmp/glyph-metrics.json
```

Validate that the result is the metrics JSON object, copy it to `apps/tui/renderer/assets/glyph-metrics.json`, then run asset sync. The static artwork is a real frame captured from the same GPU pipeline; regenerate with `cargo run --manifest-path apps/tui/Cargo.toml -p tui-renderer --example probe -- /tmp/fallback.json` and copy the resulting JSON to `core/assets/fallback.json` before syncing.

GPU glyph output is font-independent character data, but visual coverage will vary with the user's terminal font. Route orbit position, drift, aim, and framing use the shared website presets. The native introduction/route transitions use spherical eased interpolation; they do not reproduce the browser's complete motion-derivative transition solver.

## Verification

```sh
cargo test --manifest-path apps/tui/Cargo.toml -p tui-core -p tui-renderer -p austindelic
cargo clippy --manifest-path apps/tui/Cargo.toml -p tui-core -p tui-renderer -p austindelic --all-targets -- -D warnings
cargo fmt --manifest-path apps/tui/Cargo.toml -p tui-core -p tui-renderer -p austindelic --check
uv run --with pyte apps/tui/scripts/smoke.py apps/tui/target/debug/austindelic /tmp/austindelic-smoke --gpu
```

The PTY harness exercises screens, Explore controls, repeated resize, q, Ctrl-C, and SIGTERM. It records terminal captures, input latency, and checks terminal settings after the child exits. Omit `--gpu` for GPU-independent lifecycle tests. For a genuine GPU check, run outside sandboxes that hide Metal adapters.

`AUSTINDELIC_DIAGNOSTICS=/tmp/metrics.json` records session metrics on exit. It does not transmit data. Layout snapshots cover 60×18, 80×24, 120×40, and 160×50. Set `UPDATE_SNAPSHOTS=1` only when intentionally updating them.

See [VALIDATION.md](VALIDATION.md) for measured results and remaining verification.

## License

Copyright (c) Austin Delic. [MIT](LICENSE). Shader sources retain the website's source notices.

## Distribution size

The launcher uses exact-version optional packages for the five supported targets. npm installs only the matching binary, including with install scripts disabled. The release workflow measures the previous all-platform layout, validates all six tarballs, and tests OS/CPU filtering against an isolated local registry. Native execution still runs on each target's own runner.

Run `python3 apps/tui/scripts/compare-builds.py` from the repository root to compare the default release baseline against thin/full LTO at optimization levels 3, s, and z. On macOS/Linux with GPU access, pass the baseline and candidate paths to `python3 apps/tui/scripts/benchmark.py`. This records seven startup samples and three throughput/input-latency samples per build; select the smallest build within 10% of the baseline. Compiler comparisons abort if application sources change during the study.

`packed/sizes.json` records native bytes, npm compressed bytes, installed bytes, and artifact integrity. `packed/comparison.json` includes baseline comparisons. Copy accepted `size`, `unpackedSize`, and `executableBytes` measurements for each package into `scripts/size-budgets.json`; the release check permits at most 5% growth. Missing budgets are reported on main/manual runs and block tagged publication. Do not set unmeasured platform budgets. A first complete five-platform run is needed before publishing.

For local packaging, generate notices, place the executable under `release/native/<target>/`, set `NPM_CLI_JS` to npm's `bin/npm-cli.js`, and run `NPM_TARGET=<target> node apps/tui/scripts/pack.cjs <output-directory>`. This produces development-only artifacts. Full release assembly omits `NPM_TARGET` and requires all five native/baseline binaries and measurement files from `release-build.sh`.
