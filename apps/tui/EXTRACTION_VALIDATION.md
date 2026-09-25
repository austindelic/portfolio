# Portfolio extraction validation

Validated in an isolated worktree; no deployment, push, repository rename or package publication performed here. The integration preserves snapshot 0013008 and adopts upstream main through 57895d0 (including current content, TypeScript tooling, terminal backgrounds and transparent README artwork).

## Verified locally

- Astro 5.16.6 production build with the packed `@austindelic/blackhole` 0.1.0 candidate, repeated with the explicitly finalized web package at commit 2914babf (archive SHA-256 c68f3f8273c7ceb2cd87cdd59e36b9aafa59e107325560200af0146245aa2e0b).
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

Final launch verification uses the published Blackhole 0.1.0 packages. Bun integrity and Cargo checksums were replaced with verified public-registry values; the pinned Bun 1.3.5 frozen install, production Astro build, and locked Cargo tests passed. No local tarball paths or Cargo patches remain in the manifests. The exact CI-built browser archive also passed the existing full WebGPU Explore flow with no console errors or failed requests.

Linux, Windows and Intel macOS execution were not tested on this Apple Silicon host. The five-target release workflow verifies compilation, fixtures, and packaged launchers; it does not claim live GPU/PTY coverage on every runner. The ordinary CI workflow builds/tests the website and Linux CLI against external registry packages. Existing size budgets must be remeasured if the final release exceeds them; they are not relaxed here.

The live site is Workers Static Assets, not Pages. Root wrangler.jsonc targets Worker austindelic with compatibility date 2026-09-21 and static 404 handling. Deployment and custom-domain verification belong to the coordinator.

## GPL launcher size baseline

Release run 36094255202 built all five native targets successfully, then stopped at the launcher archive budget. The required GPL-3.0 license is 35,149 bytes; the prior launcher budget covered the shorter MIT notice. Only the launcher baseline is updated: 16,212 compressed bytes (the measured CI npm archive) and 45,073 unpacked bytes (the larger GitHub-scoped manifest). Local assembly from that run's native artifacts measured npm 16,204 / 44,995 bytes and GitHub 16,205 / 45,073 bytes; compression varies slightly with the npm/Node runtime. All five native package budgets and the existing 5% tolerance remain unchanged. Both registries pass the package-size and platform-selection checks with this baseline.
