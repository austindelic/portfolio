# austindelic

Austin Delic's portfolio in your terminal, with a live GPU black hole and interactive Explore controls. The app runs on your computer; no application server is required.

```sh
npx austindelic
```

Requires Node 22 or newer and a terminal of at least 60×18 characters. The package bundles the executable: no Rust installation, install scripts or runtime binary downloads. Supported platforms are macOS 13+ ARM64/x64, Linux ARM64/x64 with glibc 2.36+ (Debian 12 or newer), and Windows x64. Use a native Node installation for your architecture. Linux graphics require a Vulkan driver; Wayland clipboard support requires the system Wayland client library. Alpine/musl is not supported.

Metal, Vulkan and DirectX 12 render locally into terminal characters. If graphics initialization fails, automatic mode retains static artwork. Use `npx austindelic --renderer gpu` to require live rendering, or `--renderer static` to disable graphics.

Use Tab and arrows to navigate, Enter to activate, `?` for help, and Ctrl-C to quit. Explore uses WASD, IJKL or mouse dragging. Outside Explore, `q` also quits. Resize your terminal freely. URLs and the embedded resume open using your operating system's default application; copying email uses the system clipboard. A true-colour terminal gives the intended appearance. Departure Mono is optional.

## Releasing from the repository

This directory is a standalone npm distribution, outside the Bun workspace. Application code stays in the adjacent Rust crates. Native files and dependency notices are generated, not committed.

The `release-tui.yml` workflow automatically builds and tests when changes to `apps/tui/` or the release workflow land on `main`. It builds five targets, checks Cargo/npm/tag versions, generates license notices, creates one tarball, and tests that exact tarball on all five platforms. Download the `npm-package` artifact after the run passes. Main-branch and manual runs do not publish; publication requires a `tui-vX.Y.Z` tag and npm trusted publishing setup. `tui-v0.1.0` corresponds to Cargo and npm version `0.1.0`. Never publish a locally packed single-platform test archive.

Before the first publication, confirm ownership/availability of the npm name `austindelic`, complete npm's initial package setup, and configure its trusted publisher for this GitHub repository and `release-tui.yml`. Subsequent tag releases use GitHub OIDC with npm provenance. No npm token is stored here.

CI terminal tests use static mode to verify controls and lifecycle. Linux software Vulkan and Windows WARP probes execute the shader pipeline. Physical Metal/DX12/Vulkan hardware, platform browser/clipboard actions and visual quality still require platform acceptance testing; compilation alone is not graphics verification.

See `apps/tui/VALIDATION.md` in the repository for actual results.

## License

MIT. The generated `THIRD_PARTY_NOTICES.md` includes dependency license texts and retained shader source credits.
