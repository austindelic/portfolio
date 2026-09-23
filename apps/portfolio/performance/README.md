# Portfolio performance pass — 23 September 2026

For the subsequent React-free loading and compilation pass, measured against `9346a5f`, see [the second-pass report](pass2/README.md). The measurements below describe the first pass only.

The default renderer performs less setup and CPU work while preserving its rendered output. The acceptance targets are **not fully met**: initial external JavaScript is 16.7% smaller (14.7% with the same gzip settings), and synchronous frame completion improved about 5–6% at desktop sizes, below the requested 20% transfer and 25% dominant-rendering-cost targets. No resolution, sampling, precision, frame cap, shader timing, typography, glass styling, or default backend was changed to improve these numbers.

## Results

Production builds, Chrome 153 headless, ANGLE Metal on Apple M5, browser DPR 1. Mobile means a 390×844 viewport on this desktop GPU, not a physical mobile device. Values below are medians across five samples per viewport. Full measurements and resolved shader uniforms/settings are in [baseline.json](baseline.json) and [final.json](final.json).

| Metric | Before | After |
| --- | ---: | ---: |
| Default draw calls/frame | 6 | 3 |
| Retained programs | 11 | 3 |
| Retained textures | 11 | 7 |
| Retained framebuffers | 7 | 3 |
| Canvas layout reads/steady frame | 1 | 0 |
| Initial external JS, uncompressed | 460,450 B | 383,334 B |
| Initial external JS, gzip estimate | 133,795 B | 114,088 B |
| Initial external JS, Brotli estimate | 113,053 B | 97,810 B |

Bundle counts follow static imports from the built home page and its hydrated island. They exclude dynamic editor/backend/benchmark chunks, inline scripts, HTML and other assets. Compression uses identical Node settings on both builds; these are reproducible transfer estimates, not measurements of a deployed CDN.

| Viewport | CPU frame median, before → after | CPU P95 | First shader draw |
| --- | --- | --- | --- |
| 1440×900 | 0.20 → 0.10 ms | 0.40 → 0.20 ms | 123.8 → 49.4 ms |
| 2560×1440 | 0.10 → 0.10 ms | 0.20 → 0.20 ms | 163.3 → 115.7 ms |
| 390×844 | 0.30 → 0.10 ms | 0.50 → 0.30 ms | 125.5 → 68.2 ms |

A second independent five-sample run is retained in [baseline-repeat.json](baseline-repeat.json) and [final-repeat.json](final-repeat.json). CPU medians were 0.3→0.1 ms at 1440, 0.1→0.1 ms at 2560, and 0.3→0.1 ms at 390; first-draw medians were 113.4→53.8, 150.4→102.9 and 114.9→53.1 ms respectively. At 2560, both repeat medians were 16.7 ms with 33.4 ms P95. Variation between runs reinforces the limit on any sustained-FPS claim.

These CPU durations include instrumentation overhead and are close to timer resolution. First draw is recorded from navigation start in repeated local loads with browser cache reuse; it is not cold-network LCP or presentation time. Five fresh navigations use two seconds warm-up and three seconds sampling each. Main-thread long tasks, frame spacing, dropped-frame proxies, GL calls and resource counts are retained in the raw JSON.

| Viewport | Synchronous frame+readback median, before → after | P95 |
| --- | --- | --- |
| 1440×900 | 9.7 → 9.1 ms | 14.1 → 13.3 ms |
| 2560×1440 | 19.9 → 18.8 ms | 25.7 → 24.6 ms |
| 390×844 | 4.2 → 4.2 ms | 8.2 → 6.8 ms |

The separate completion experiment warms 120 deterministic frames, then measures 120 frames in each of five samples with a synchronous one-pixel `readPixels` after every frame. This includes driver/readback overhead and is **not isolated GPU timer-query evidence**. Raw data is in [baseline-readback.json](baseline-readback.json) and [final-readback.json](final-readback.json). GPU timer queries did not produce usable evidence here. The unchanged full raymarch remains the dominant cost. Large-desktop rAF pacing varied (16.7/33.3 ms median, with 33.4 ms P95); this pass does not establish a sustained FPS increase at that size.

## Implementation

- Cache canvas size until resize or DPR changes. Configure vertex attributes/VAOs, draw buffers and samplers once per resource lifetime. Cache unchanged uniform values and reuse pass channel arrays.
- Skip all three bloom passes and texture sampling at zero contribution; allocate and compile bloom resources before the first contributing frame. Positive bloom still produces the original output.
- Remove the unused optimized-pipeline setup. The original `initialPrepassScale` property did not exist on resolved settings, so allocation always failed and the displayed result was the fallback pipeline. This pass explicitly preserves that effective pipeline instead of silently changing the image by activating the unused one.
- Load editor controls/icons, benchmark code and explicitly selected alternate backend code separately. Compact GLSL comments/whitespace at build time with token/preprocessor equivalence tests.
- Retain the persisted canvas and GPU resources across ordinary navigation. Preserve the original route-triggered shader time/history reset, independently of resource lifetime.
- Clean up partial program allocation, VAOs, observers, events and benchmark waits. Handle allocation retry, context restoration and visibility scheduling.
- Preload the existing primary font. Repair header clock/active-link setup across Astro navigation using one lifecycle-managed interval. No font/image replacement, CSS promotion removal or dependency removal was justified by measured loading cost.
- Keep drawing-buffer preservation enabled: paused/reduced-motion frames and transition snapshots retain their existing behavior. Disabling it was not retained or claimed as an optimisation.

## Visual and browser verification

[summary.json](summary.json) contains pixel comparisons. The capture harness waits for GPU completion and compositor presentation; without that wait, a large-desktop screenshot could capture a stale image even with matching frame uniforms. Animation time, RAF sequence, date, font readiness and viewport are controlled by browser-only test injection; no public production measurement API was added.

- Home at frames 30, 60, 120 and 420, all three viewports: **zero differing channels** in all twelve before/after full-page captures.
- Editor with bloom 0 and 0.4 after temporal warm-up: **zero differing channels** for both comparisons.
- Blog and socials route captures: **zero differing channels**. Post and return-home captures differ only in the header: the existing broken clock/active-link state now updates correctly. Shader uniforms, camera, frame and time match baseline at all four navigation checkpoints; see [baseline-routes.json](baseline-routes.json) and [final-routes.json](final-routes.json).
- [flows.json](flows.json): three rounds through home, blog listing, all three published posts and socials; same canvas/context/program count throughout. Scrolling, back/forward, mobile resize, two editor entry/exit cycles, bloom/ASCII controls, reduced motion, visibility pause/resume, context loss/restoration and 404 checked. No collected page errors or failed requests.
- Explicit WebGPU selection and return to Auto work; leaving the editor cancels a running benchmark. This is a functional smoke test, not WebGPU visual/performance equivalence. See [optional.json](optional.json).
- [failure-paths.json](failure-paths.json): injected initial and lazy-bloom texture allocation failures recover; injected initial and lazy-bloom shader compile failures release all created resources; missing WebGL2 shows the error state.
- [audit.json](audit.json): every route completed font loading and hydration, with no broken images or HTTP resource failures. The headless LayerTree API emitted no usable layer events (zero recorded entries means unavailable, not zero actual layers). Compositing promotions and glass CSS were retained.
- Visibility tests dispatch a synthetic hidden/resume event; physical OS background-tab suspension is not established by that test. Safari, Firefox, physical phones, high-DPR hardware and WebGPU performance remain unverified.

[Example baseline capture](../../../.playwright-cli/baseline-1440-420.png) · [matching final capture](../../../.playwright-cli/final-1440-420.png)

Local capture PNGs are under the ignored repository-root `.playwright-cli/` directory, named `baseline-*` and `final-*`. Reports retain exact comparison results without committing many megabytes of generated screenshots.

Production build succeeds for all eight routes. Focused compaction tests pass. Relevant changed renderer files pass Biome. Full-project TypeScript checking still reports existing errors in untouched legacy components (including missing Three declarations); there are no diagnostics for the changed BlackHole components.

## Reproduce

Use the lockfile and the same machine/browser for both builds. Run commands from repository root. The original source revision was `8ae3a3dec0b7b842faf18cc17210c2ec917f6e6c`. Before applying changes, retain a production build in a separate directory; this run used `/private/tmp/portfolio-perf-baseline`. Serve baseline and candidate with the same Astro preview server configuration on different ports. Do not benchmark the development server.

```sh
bun install --frozen-lockfile
bun run --cwd apps/portfolio build
bun run --cwd apps/portfolio test:performance
# Run these in separate terminals:
bun run --cwd apps/portfolio preview --host 127.0.0.1 --port 4321
bun run --cwd apps/portfolio preview --host 127.0.0.1 --port 4399 --outDir /private/tmp/portfolio-perf-baseline
```

Use the Playwright CLI skill. Keep only one benchmark browser active. In environments where the global shim is unavailable, `bunx @playwright/cli` works. `TMPDIR=/private/tmp` was needed in the sandbox here.

```sh
bunx @playwright/cli -s=perf open 'http://127.0.0.1:4399/?perfRun=baseline' --browser=chrome
bunx @playwright/cli -s=perf run-code --filename=apps/portfolio/scripts/perf/measure.js > /private/tmp/portfolio-baseline-measure.log
bunx @playwright/cli -s=perf close
```

Repeat on port 4321 with label `final` and output `portfolio-final-measure.log`. Run each other scenario in a fresh browser session opened on the appropriate labelled origin:

| Script | Log suffix | Purpose |
| --- | --- | --- |
| `capture.js` | `baseline-capture` / `final-capture` | Deterministic home PNGs |
| `capture-routes.js` | `baseline-routes` / `final-routes` | Navigation PNGs/uniform checkpoints |
| `capture-editor.js` | `baseline-editor` / `final-editor` | Bloom on/off PNGs |
| `measure-completion.js` | `baseline-readback` / `final-readback` | Frame plus synchronous readback |
| `flows.js` | `flows` | Candidate navigation/lifecycle assertions |
| `audit-routes.js` | `audit` | Fonts, images, hydration and resource status across all routes |
| `optional.js` | `optional` | Explicit alternate backend and benchmark cancellation |
| `failure-paths.js` | `failures` | Candidate injected failures |

Scripts return JSON through the CLI `### Result` section. Inspect `failures`, `errors`, `consoleErrors` and `badRequests`; CLI success alone does not imply the assertions passed. Capture scripts preserve temporal warm-up. Do not use image snapshots captured before fonts load as a visual baseline.

```sh
bun apps/portfolio/scripts/perf/summarize.mjs /private/tmp/portfolio-perf-baseline apps/portfolio/dist /private/tmp
```

Deployment is outside this pass. Remaining performance work should start with isolated GPU profiling on target devices and cold-transfer measurements; reducing quality to reach the targets is not an acceptable substitute.
