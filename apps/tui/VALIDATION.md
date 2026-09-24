# Validation — 24 September 2026

Environment: Apple Silicon macOS, Apple M5 GPU, Rust 1.96.1.

## Executed

- All six canonical WGSL shader passes compiled and ran on Metal.
- Offscreen 120×40 probe: 1.30 s GPU initialization, 1,132 completed frames over 12 seconds, approximately 94.3 FPS. This measures the renderer, **not terminal output**.
- The captured frame shows a lensed ring and accretion disk and is bundled as the static fallback.
- Static-mode PTY navigation: Home → Blog → article → Socials → Explore, help and back, and resize through 60×18, 30×10, 80×24, 160×50, and 120×40.
- PTY q, Ctrl-C, and SIGTERM exits restored original termios settings, cursor visibility, and alternate-screen state.
- Automatic no-adapter fallback passed the same PTY navigation, resize, and cleanup flow in a GPU-restricted sandbox.
- Release-binary maximum measured input-to-draw latency (including terminal writes): approximately 30.1 ms across the static and fallback runs. Earlier debug measurements excluded part of the draw and are superseded.
- 13 Rust tests passed: content/navigation/Markdown/sanitization/layouts, renderer metadata/orbits, and CLI argument/Explore controls.
- Clippy passed with warnings denied for the new CLI, core, and renderer.
- Preserved SSH adapter passed `cargo check`.
- Astro production build passed, generating eight pages; all 43 existing website regression tests passed.
- Playwright verified Home's three projects, three published blog posts and a full article, seven social links, and Explore open/close. No page errors. Navigation produced three `ERR_ABORTED` requests during Astro client navigation; the destination pages loaded and assertions passed.

## Still required before claiming full acceptance

- Complete the integrated GPU PTY run and sustained terminal-output FPS measurement. The offscreen renderer measurement does not establish the 30 FPS terminal target.
- Compare fixed-camera, fixed-time browser and terminal captures visually.
- Exercise injected GPU device loss and verify the fallback transition while the terminal is active.
- Demonstrate the release binary in a graphical macOS terminal with Departure Mono configured.

The final Metal/PTY rerun was blocked by the automatic approval service returning `401 Unauthorized: Missing bearer or basic authentication`. This was an approval-service failure, not a safety rejection. Static lifecycle tests were completed separately without GPU access.

The release binary was installed into `apps/tui/dist/install/bin`, then passed static, Ctrl-C, SIGTERM, and automatic-fallback PTY runs. The Apple Silicon archive is under `apps/tui/dist`.

The native route transitions deliberately use spherical easing over shared camera presets, rather than a full port of the browser's derivative-based transition solver.
