# Austin Delic — terminal portfolio

A native macOS CLI with the website's content and GPU black hole, rendered as actual terminal characters. Ratatui and Crossterm handle the terminal; `wgpu` runs the website's WGSL shaders offscreen through Metal. There is no window, browser, or Bevy runtime.

## Install and run

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

Content, published blog posts, shaders, glyph metrics, static artwork, and the resume PDF are embedded. No network or repository is needed at runtime. External links use the macOS `open` command only when activated. Copy email uses `pbcopy`.

The initial package targets Apple Silicon macOS. Metal is optional: automatic mode starts with a static black hole and keeps it if GPU initialization fails. The existing SSH adapter is preserved, with no new server functionality. Ratzilla and Trunk have been removed.

## Terminal setup

Install [Departure Mono](https://departuremono.com/) and select it in your terminal's font preferences. A CLI cannot choose the host terminal's font. Any monospace font works; no Nerd Font is required. Use a true-colour terminal for the intended pure-black background, silver, orange, and shader colours. `NO_COLOR` is respected by the terminal backend.

```sh
austindelic --renderer auto --fps 30
austindelic --renderer gpu             # fail clearly if Metal cannot initialize
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
| Time / exposure / bloom | [ / ], - / +, comma / period |

Explore is entered through the navigation bar. In static mode it displays the fallback and explains that camera controls require the GPU. External actions report success or failure in the footer. Markdown links and images are listed as selectable actions at the end of each article. Use your terminal's selection override (typically Shift-drag) to select text while mouse capture is enabled.

## Source and assets

- `core`: content, Markdown presentation, navigation, terminal composition, and the compatibility facade used by SSH.
- `cli`: terminal lifecycle, events, macOS actions, and renderer orchestration.
- `renderer`: Metal device, six website shader passes, triple-buffered asynchronous cell readback, latest-value worker mailboxes, and authored route cameras.
- `ssh`: preserved legacy server. Its existing privileged port/key configuration is unchanged.

Canonical profile/project/social records and camera presets live in the portfolio application's `src/data`. Astro reads those files directly. Blog Markdown remains under `src/content/blog`. The TUI build parses frontmatter, excludes `published: false`, and embeds posts newest first.

```sh
node apps/tui/scripts/sync-assets.mjs
node apps/tui/scripts/sync-assets.mjs --check
```

Sync copies website content, resume, shaders, uniform layout, and routes into package assets, removes obsolete post copies, and records SHA-256 hashes. Run it before building after content changes. Committed package assets let `cargo install --path apps/tui/cli` build without Node or a running website.

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
cargo check --manifest-path apps/tui/Cargo.toml -p tui-ssh
uv run --with pyte apps/tui/scripts/smoke.py apps/tui/target/debug/austindelic /tmp/austindelic-smoke --gpu
```

The PTY harness exercises screens, Explore controls, repeated resize, q, Ctrl-C, and SIGTERM. It records terminal captures, input latency, and checks terminal settings after the child exits. Omit `--gpu` for GPU-independent lifecycle tests. For a genuine GPU check, run outside sandboxes that hide Metal adapters.

`AUSTINDELIC_DIAGNOSTICS=/tmp/metrics.json` records session metrics on exit. It does not transmit data. Layout snapshots cover 60×18, 80×24, 120×40, and 160×50. Set `UPDATE_SNAPSHOTS=1` only when intentionally updating them.

See [VALIDATION.md](VALIDATION.md) for measured results and remaining verification.

## License

Copyright (c) Austin Delic. [MIT](LICENSE). Shader sources retain the website's source notices.
