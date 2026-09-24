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

- Run the complete five-platform release workflow and test the single assembled tarball on every target. Local development archives containing only one target must not be published.
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
