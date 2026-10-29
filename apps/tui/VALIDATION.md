# Local CLI distribution validation — 24 September 2026

The terminal portfolio is distributed only through npm and runs on the visitor's computer. The website remains on Cloudflare Pages. The former hosted SSH service and server deployment have been removed.

## Verified before the final removal checks

- All six canonical WGSL shader passes ran on an Apple M5 using Metal.
- The macOS ARM64 release was packed with dependency notices, installed in a directory containing spaces, and exercised through npm exec (npx's implementation) in a real PTY: version, navigation, help, resize, q and Ctrl-C passed.
- Integrated Metal PTY run: 267 GPU frames in 11.77 seconds, approximately 22.68 FPS, with maximum measured input-to-draw latency of 26.87 ms. Navigation, Explore and resize passed. Static, Ctrl-C and SIGTERM runs restored terminal settings, cursor visibility and alternate-screen state.
- Automatic fallback passed lifecycle checks without access to a GPU.
- Windows x64 (including DirectX 12 dependencies) and Intel macOS compile checks passed. Compilation is not runtime or graphics verification on those platforms.
- Linux ARM64 previously built and executed the live software Vulkan renderer. A local two-CPU offscreen probe measured approximately 10.5 FPS at 60×20; this is not a guarantee for other computers.
- Website build, regression tests and browser navigation previously passed. No website source or public DNS is changed by removing the hosted terminal service.

## Release gates

- Run the complete five-platform release workflow and test the assembled platform packages and launcher on every target. Local development archives containing only one target must not be published.
- Verify Windows WARP and physical GPU execution, platform browser/resume/clipboard actions, and terminal behavior on Windows and Intel macOS.
- Complete fixed-camera browser/terminal visual comparison, injected GPU device-loss recovery and longer sustained rendering measurements.
- Set up npm package ownership and trusted publishing. No npm package has been published during implementation.
- Import/reconcile the existing Cloudflare Pages project before applying its infrastructure configuration. No infrastructure application is necessary to run the local CLI.

Native route transitions use spherical easing over shared camera presets rather than the browser's complete motion-derivative transition solver. The npm package stays outside the Bun workspace, with generated binaries and dependency notices excluded from Git.

## After removing hosted SSH

- 14 remaining workspace Rust tests pass; workspace Clippy with warnings denied, Rust formatting and canonical asset checks pass.
- Five Node launcher tests pass. The rebuilt macOS ARM64 development tarball passes npm exec version and PTY navigation, help, resize, q and Ctrl-C checks.
- OpenTofu initialization, schema validation and the Cloudflare-only mocked plan pass. The provider lockfile no longer includes Hetzner, and no server or DNS resources remain in the configuration.
- Release and infrastructure workflow lint passes. npm publication depends only on the five-platform package tests; container publishing and server tests have been removed.


## Distribution size optimization — 24 September 2026

Measured on macOS ARM64 with Rust 1.96.1. Full samples and package metadata are in `size-measurements.json`; measurements are local, not cross-platform performance guarantees.

| Release settings | Executable bytes | gzip bytes |
| --- | ---: | ---: |
| Default baseline | 7,809,632 | 2,815,713 |
| Thin LTO, level 3 | 5,673,936 | 2,370,903 |
| Thin LTO, level s | 4,915,360 | 2,030,581 |
| Thin LTO, level z | 4,146,944 | 1,926,207 |
| Full LTO, level 3 | 5,125,632 | 2,192,368 |
| Full LTO, level s | 4,134,720 | 1,801,582 |
| Full LTO, level z (selected) | 3,333,344 | 1,621,120 |

Every optimized candidate uses one code-generation unit and stripped symbols. Panic unwinding remains enabled. The selected executable is 57.3% smaller. Unused calendar/macros and Markdown HTML-output dependency features were removed; layout caching and graphics backends remain enabled.

The final same-source comparison used seven startup samples and three ten-second GPU/input samples per build, with identical terminal dimensions and a 30 FPS target. Selected-build medians versus baseline: startup 7.51 vs 7.59 ms; throughput 29.80 vs 29.90 FPS; per-run maximum input latency 12.12 vs 11.79 ms. All three measures satisfy the 10% allowance. Earlier three-sample startup timings were noisy; the expanded sample is retained in the measurement file.

Exact duplicate license texts are shared by reference. All 534 original notice blocks remain represented verbatim by 176 distinct texts; notices shrink from 2,760,788 to 661,410 bytes.

Both scoped and unscoped package-selection matrices passed for all five OS/CPU combinations using synthetic binaries: these verify npm selection and downloading, not execution of foreign native code. Real macOS ARM64 tarballs are measured separately. The launcher is approximately 4.2 KB compressed; launcher plus host package is approximately 1.68 MB downloaded and 4.01 MB unpacked.

Fixed size budgets are populated only for the locally measured launcher and macOS ARM64 package, taking the larger scoped/unscoped measurement. Every published package must have a budget and stay within 105% of it. The first complete CI run must supply accepted Linux, Windows and Intel macOS sizes before publication. CI generates per-platform native baselines and compares an actual reconstructed all-platform npm archive; no aggregate five-platform savings are claimed from local fixtures.

No packages were published by the size-optimization task.

Final verification: 18 Rust tests plus the explicitly enabled Metal resolution test pass; six launcher tests pass; both real macOS package variants pass clean installation, version/help, navigation, resize, q and Ctrl-C through native/launcher/npm entry points. The full smoke harness passes static, Ctrl-C, SIGTERM, no-GPU fallback and live Metal Explore/resolution controls, including terminal restoration. Clippy, formatting, canonical asset checks, workflow/shell lint and whitespace checks pass. Foreign-platform native execution remains pending CI.
