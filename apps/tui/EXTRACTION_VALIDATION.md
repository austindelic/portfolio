# Portfolio extraction validation

Validated in an isolated worktree; no deployment, push, repository rename or package publication performed here. The integration preserves snapshot 0013008 and adopts upstream main through 57895d0 (including current content, TypeScript tooling, terminal backgrounds and transparent README artwork).

## Verified locally

- Astro 5.16.6 production build with the packed `@austindelic/blackhole` 0.1.0 candidate.
- TypeScript checks for workspace tooling and isolated release tools; lint completes with existing non-null-assertion/style warnings.
- Six mobile/navigation lifecycle unit checks, browser-audit compilation and authored-TypeScript check, hosting configuration check.
- Playwright CLI: desktop home/blog/article/social navigation, 3 projects / 2 posts / 7 socials, Explore entry and exit; zero console errors or failed requests.
- Playwright CLI: mobile portrait/landscape, scrolling, routes and history; zero GPU contexts, renderer requests, console errors or failed requests.
- Playwright CLI: WebGPU Explore ASCII toggle, 1/100/25% render scale, unchanged canvas/glyph size/camera, keyboard focus and movement, reset, Escape, re-entry and navigation cleanup; zero console errors or failed requests. Diagnostics opt in through `?bhDebug=1` and read the package's per-instance stats.
- 17 Cargo tests, including terminal layout snapshots, terminal background composition and retained Explore resolution display. Clippy passes with warnings denied.
- macOS Apple M5 native PTY checks: static mode, both terminal-background flags, page navigation, Explore, resizes, q, Ctrl-C, SIGTERM, and terminal attribute restoration. GPU run completed 284 frames at ~23.1 average FPS during the scripted flow; maximum measured input-to-draw latency ~34.6 ms. This is a flow check, not a release performance benchmark.
- Six npm launcher tests and 20 release tests, including both registries' five-platform assembly/selection, archive integrity, version alignment and tested-snapshot recovery.
- Real semantic-release 25.0.9 dry run in a local-only copy with the fetched remote tags: `tui-v1.0.1` at b3f9e95 selects patch 1.0.2. No tag or publication occurred. CLI and all npm optional packages are stamped 1.0.2; Blackhole dependencies remain 0.1.0.

## Release prerequisites and limits

Local browser validation installs a packed tarball. Native validation also passed against the packaged .crate archives, unpacked with an uncommitted temporary Cargo patch configuration; neither local path is present in final manifests. Lock entries target registry versions with candidate package archive checksums. Coordinator-added final package metadata changes these archive hashes, so these are provisional until registry regeneration. After publishing the exact Blackhole 0.1.0 artifacts, regenerate/verify Bun and Cargo locks against the public registries and run frozen/locked clean installs before enabling publication or deployment.

Linux, Windows and Intel macOS execution were not tested on this Apple Silicon host. The five-target release workflow remains responsible for native PTY/GPU and package verification on their own runners. The ordinary CI workflow builds/tests the website and Linux CLI against external registry packages. Existing size budgets must be remeasured if the final release exceeds them; they are not relaxed here.

The live site is Workers Static Assets, not Pages. Root wrangler.jsonc targets Worker austindelic with compatibility date 2026-09-21 and static 404 handling. Deployment and custom-domain verification belong to the coordinator.
