# austindelic

Austin Delic's portfolio in your terminal, with a live GPU black hole and interactive Explore controls. The app runs on your computer; no application server is required.

```sh
npx austindelic
```

Requires Node 22 or newer and a terminal of at least 60×18 characters. npm installs a companion package containing only your platform’s executable: no Rust installation, install scripts or runtime binary downloads. Supported platforms are macOS 13+ ARM64/x64, Linux ARM64/x64 with glibc 2.36+ (Debian 12 or newer), and Windows x64. Use a native Node installation for your architecture. Linux graphics require a Vulkan driver; Wayland clipboard support requires the system Wayland client library. Alpine/musl is not supported.

Metal, Vulkan and DirectX 12 render locally into terminal characters. If graphics initialization fails, automatic mode retains static artwork. Use `npx austindelic --renderer gpu` to require live rendering, or `--renderer static` to disable graphics.

Use Tab and arrows to navigate, Enter to activate, `?` for help, and Ctrl-C to quit. Explore uses WASD, IJKL or mouse dragging. Outside Explore, `q` also quits. Resize your terminal freely. URLs and the embedded resume open using your operating system's default application; copying email uses the system clipboard. A true-colour terminal gives the intended appearance. Departure Mono is optional.

## Releasing from the repository

This directory is a standalone npm distribution, outside the Bun workspace. Application code stays in the adjacent Rust crates. Native files and dependency notices are generated, not committed.

The `release-tui.yml` workflow builds and tests five targets whenever terminal, shared shader, embedded content, or release-tool changes reach `main`. Semantic-release chooses one version before compilation: ordinary relevant commits produce a patch, `feat:` a minor, and a `BREAKING CHANGE:` footer a major release. The first automated release is `1.0.0`. Generated version changes stay in the build checkout.

Each registry gets six tarballs: a small launcher and five optional platform packages. Every platform installs both variants from an isolated registry serving the exact archives, verifies host-only downloads and the CLI version, and runs terminal checks. Size comparisons and license notices remain part of packaging. Publishing requires accepted size budgets for every platform.

Once initial setup is complete, passing main runs publish `austindelic` to npmjs.com and `@austindelic/austindelic` to GitHub Packages. Both contain identical native binaries. The workflow publishes native dependencies before their launcher, creates a `tui-vX.Y.Z` tag, and creates a GitHub Release after both registries finish. Tag pushes do not trigger another publication.

Manual runs default to verification only. The `tested-release` artifact contains both package sets, size reports, source revision, release notes and integrity hashes. Recovery reuses these bytes; it never rebuilds an already published version. See [release setup and recovery](https://github.com/austindelic/austindelic/blob/main/apps/tui/release/README.md) for account setup, activation and retries. Never publish locally packed single-platform test artifacts.

### Installing from GitHub Packages

The public npm command above remains the easiest installation. To use GitHub Packages, authenticate with a classic GitHub token with `read:packages`, configure the scope, and install the scoped package:

```sh
npm login --scope=@austindelic --auth-type=legacy --registry=https://npm.pkg.github.com
npm config set @austindelic:registry https://npm.pkg.github.com
npx @austindelic/austindelic
```

GitHub requires authentication even for public npm packages hosted there. The installed command is still `austindelic`.

CI terminal tests use static mode to verify controls and lifecycle. Linux software Vulkan and Windows WARP probes execute the shader pipeline. Physical Metal/DX12/Vulkan hardware, platform browser/clipboard actions and visual quality still require platform acceptance testing; compilation alone is not graphics verification.

See `apps/tui/VALIDATION.md` in the repository for actual results.

## License

MIT. The generated `THIRD_PARTY_NOTICES.md` includes dependency license texts and retained shader source credits.

Optional dependencies must be enabled. If a native package is missing, reinstall with `npm install --include=optional austindelic`. No install scripts are required.

Release artifacts include `sizes.json` and `comparison.json` with compressed, installed, and native binary sizes. Accepted measurements in `scripts/size-budgets.json` allow at most 5% growth. Verification runs can establish missing platform baselines; publication requires a recorded budget for every package.
