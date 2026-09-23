# Second performance pass

Baseline: `9346a5f1177b91a0b4d4023235f56080522c5c1a`. This report is separate from the first pass in the parent directory.

## Measured results

Initial external JavaScript falls from **114,088 B to 50,944 B gzip (55.3% less)**, exceeding the 40% target relative to this baseline. Uncompressed size is 383,334 → 185,382 B; Brotli is 97,810 → 43,745 B. [bundles.json](bundles.json) records each reachable module. Actual public-page requests contain only the router, background entrypoint and shared runtime; editor/React/backend/benchmark code remains optional.

Five interleaved samples per viewport, median of sample medians/P95 values:

| Viewport | Frame + readback median, before → after | P95, before → after | RAF spacing median | RAF spacing P95 |
| --- | --- | --- | --- | --- |
| 1440×900 | 29.7 → 25.9 ms | 45.3 → 42.1 ms | 16.7 → 16.7 ms | 33.4 → 33.4 ms |
| 2560×1440 | 41.7 → 41.5 ms | 59.4 → 57.4 ms | 33.3 → 33.3 ms | 50.0 → 50.1 ms |
| 390×844 | 13.2 → 13.5 ms | 25.3 → 23.1 ms | 16.7 → 16.7 ms | 16.8 → 16.7 ms |

The 1440 result is not evidence of a shader speedup: the shaders are unchanged, large-desktop cost is effectively unchanged, and earlier trial timings varied substantially. The sustained 25% target is unmet. CPU frame medians/P95 are near the browser timer resolution (roughly 0.1/0.2 ms); there is no meaningful sustained CPU regression in this run. Dropped-frame proxies and resource counts are in the raw results.

| Viewport | First draw | First completed GPU frame | First presentation opportunity | Compile/link/status call blocking |
| --- | --- | --- | --- | --- |
| 1440×900 | 158.5 → 168.7 ms | 165.2 → 181.6 ms | 180.8 → 197.2 ms | 35.5 → <0.1 ms |
| 2560×1440 | 198.3 → 224.4 ms | 223.3 → 241.7 ms | 227.0 → 256.1 ms | 37.9 → <0.1 ms |
| 390×844 | 80.8 → 66.4 ms | 89.2 → 75.8 ms | 95.9 → 85.2 ms | 35.8 → <0.1 ms |

Compilation polling removes measured main-thread blocking; it does not establish a shorter total compile or desktop first-frame time. Desktop first-draw medians were higher in this run, with broad overlapping ranges (1440: baseline 123–357 ms, candidate 126–257 ms; 2560: 156–285 ms and 207–367 ms). These cache-disabled local loads reuse the driver cache and do not represent cold-network/CDN latency. Startup long tasks are preserved rather than attributed entirely to compilation.

A separate [five-sample startup repeat](p2repeat-measure-startup.json) gave first-draw medians of 147.1 → 164.5 ms (1440), 250.5 → 230.8 ms (2560), and 77.4 → 76.2 ms (390). The 1440 candidate median was roughly one frame later in both runs; this is a remaining startup limitation, not a claimed improvement. The large-desktop direction reversed in the repeat. Only startup fields from that short repeat are meaningful; its brief frame samples are not sustained-animation evidence.

Raw acceptance data: [completion samples](p2final-readback.json), [startup and sustained samples](p2final-public.json). Both contain five samples per build per viewport; the public run collected no page errors or failed requests. Do not compare absolute times between the earlier shader experiments and this final run: machine load/thermal state changed, which is why each experiment uses interleaved local controls.

## Retained changes

Public pages mount the renderer from an Astro browser script. React is confined to the compatible editor adapter; both adapters use the same framework-independent runtime. The runtime owns GPU resources and exposes settings, route, camera, animation, snapshot, readiness and disposal operations. Normal Astro navigation retains one canvas/context. Leaving the background disposes its session.

Required shader compile/link commands are submitted together. `KHR_parallel_shader_compile` completion is polled before querying link status; unsupported browsers use the synchronous fallback. Cancellation frees pending shaders/programs and obsolete context generations cannot publish completed work. Unexpected bloom changes synchronously finish the required batch before rendering their first contributing frame.

Font readiness is checked before creating the glyph atlas. A disposed or superseded runtime cannot mount after a delayed font load. Editor APIs and alternate backend selection remain compatible. No shader mathematics, precision, resolution, sample count, bloom, haze, glass, or frame-rate cap changed.

## Verification and visual evidence

- Production build passes for all eight routes. All 13 focused tests pass: shader compaction, compilation completion/fallback/cancellation/allocation failure, runtime ownership, font cancellation, restoration, and import boundaries. Relevant production files pass Biome. Full-project TypeScript still has pre-existing errors in untouched legacy Three/3D components; no changed BlackHole file has diagnostics.
- [Navigation/lifecycle checks](p2final-flows.json) pass: all published routes, 18 ordinary route changes on the same canvas/context, scrolling, back/forward, resize, repeated editor entry/exit, controls, reduced motion, visibility resume, restoration and 404. No collected console errors or bad requests.
- [Delayed font and DPR checks](p2final-font-dpr.json) pass: no GL context before font readiness, no stale public renderer after entering the editor, one context after font completion, and stable dimensions after a 0.5/1/2/1 DPR round trip. The existing 0.85 DPR cap is preserved.
- [Failure injection](p2final-failure-paths.json), [pending-compilation navigation/loss/restoration](p2final-compilation-lifecycle.json), and [optional backend/benchmark cancellation](p2final-optional.json) pass. Pending shader handles are released and obsolete work cannot render.
- [All-route asset audit](p2final-audit-routes.json) passes with no broken images, font readiness failures, pending hydration or unexpected public JS. Headless LayerTree produced no usable layer evidence; zero entries do not mean zero compositing layers. Glass and promotion CSS remain unchanged.

All 24 home animation checkpoints (eight times at three viewports, including 40 seconds of history) have identical shader uniforms/camera/time/frame values. [Full comparisons](p2before-vs-p2after.json) include full-page and canvas-element screenshots, with no masking. The 48 home comparisons differ only by 180 colour channels on the clock's top pixel row at y=52; there are no differences elsewhere. This same clock-row variation appears in [baseline-only captures](p2baseline-vs-p2baseline-clean.json). A fresh [baseline repeat](p2repeatbaseline-vs-p2before.json) was identical, so the artifact is intermittent rather than guaranteed noise on every run.

The final harness registers each test font once. A [single-registration calibration](p2fontbefore-vs-p2fontafter.json) matched both desktop sizes exactly; mobile retained only the same 180-channel clock row. It did not change production code. This is a documented limit on full-page equivalence, not an assertion that all screenshots are byte-identical. Captures control the animation clock and fonts, wait for GPU completion and compositor presentation, and preserve temporal history.

The eight editor-setting captures are [pixel-identical](p2before-settings-vs-p2after-settings.json): bloom, ASCII full/mixed/zero/off, palette, DSEG font and dense glyph sizes. All four route-transition checkpoints (eight full-page/canvas comparisons) are also pixel-identical. No new shader geometry, colour, blur, glyph selection or motion difference was detected.

Example PNGs: [baseline mobile](visuals/baseline-mobile.png) and [candidate mobile](visuals/candidate-mobile.png). Other PNGs remain in the ignored `.playwright-cli/` directory and can be regenerated with the scripts; exact changed-channel counts and bounds are committed.

## GPU experiments

All experimental shader changes were removed. The requested 25% rendering-cost improvement is not established.

| Candidate | Evidence | Decision |
| --- | --- | --- |
| Reuse raised index within a step | Two-sample trial was noisy, with a large first candidate outlier; no repeatable improvement established | Rejected |
| Reuse corrected endpoint geometry | Five 1440×900 samples: median 11.8 → 11.7 ms, P95 14.3 → 14.8 ms | Rejected: improvement below run-to-run noise |
| Move invariant shell-radius work | No reliable improvement in the exploratory run; the spin is already compile-time constant | Rejected |
| Specialize zero temporal jitter | Five 1440×900 samples: median 11.8 → 11.7 ms, P95 14.8 → 14.8 ms | Rejected: improvement below noise |
| Full-ASCII unused sample removal | Default captures matched shader pixels, but repeated instrumented timing runs stalled; no acceptable performance evidence | Rejected |
| Per-cell colour/brightness/glyph metadata | RGBA32F MRT prototype matched all 12 default captures against full-ASCII candidate; timing run did not complete | Rejected: gain unverified |
| Zero-bloom image/ASCII fusion | Explicit RGBA8 rounding and bilinear reconstruction still changed 806,501 channels across 12 default captures | Rejected: visual mismatch |

Endpoint and jitter raw trials are retained alongside their summaries. They are earlier independent experiments, not the final baseline/candidate timing runs. Browser-cold navigation does not clear driver shader caches; large first-use outliers must not be interpreted as a clean cold-GPU comparison. Interrupted and incomplete runs are excluded from acceptance results. A stall is not proof of its root cause.

`EXT_disjoint_timer_query_webgl2` was available, but pass-query values were inconsistent with additive isolated pass costs on this ANGLE/Metal setup. `p2baseline-passes.json` preserves those diagnostic values without using them to claim a GPU gain. Synchronous frame-plus-readback timings include driver overhead; they are not isolated GPU timings.

## Reproduction

Use the lockfile, production builds, the same browser/GPU/DPR, and one benchmark workload at a time. Preserve the baseline production `dist` before applying changes. Serve it on port 4400 and the candidate on 4401:

```sh
bun install --frozen-lockfile
bun run --cwd apps/portfolio build
bun run --cwd apps/portfolio test:performance
# Separate terminals:
bun run --cwd apps/portfolio preview --host 127.0.0.1 --port 4400 --outDir /private/tmp/portfolio-perf-pass2-baseline
bun run --cwd apps/portfolio preview --host 127.0.0.1 --port 4401
```

Run each Playwright CLI script in a fresh session. Capture labels come from `perfRun` in the initially opened URL. Measurement scripts alternate baseline/candidate order over five runs at each of 1440×900, 2560×1440 and 390×844.

```sh
export TMPDIR=/private/tmp
bunx @playwright/cli -s=pass2 open 'http://127.0.0.1:4400/?perfRun=p2final' --browser=chrome
bunx @playwright/cli -s=pass2 run-code --filename=apps/portfolio/scripts/perf/measure-interleaved.js > /private/tmp/portfolio-p2final-readback.log
bunx @playwright/cli -s=pass2 close
```

- `measure-public.js`: cache-disabled navigations, startup compilation blocking and first draw/completion/presentation-opportunity probes, 5.5 s warm-up then 3 s sustained sampling. Two subsequent RAF callbacks are only a presentation opportunity proxy, not proof of scanout.
- `measure-startup.js`: a separate short startup repeat; disregard its short-window frame metrics.
- `measure-interleaved.js`: fixed clock, 120 warm-up frames then 120 measured frames, completing each with a one-pixel readback. No production measurement hooks.
- `capture.js`: controlled fonts/date/clock/history, three viewports, frames 30/60/120/420/900/1500/2100/2400. The 40-second sequence covers intro and a complete idle loop. GPU completion and a compositor wait precede PNG capture.
- `capture-settings.js`, `capture-editor.js`, `capture-routes.js`: settings, bloom toggles and navigation comparisons.
- `flows.js`, `failure-paths.js`, `compilation-lifecycle.js`, `font-dpr.js`, `optional.js`, `audit-routes.js`: route/lifecycle, injected failures, cancellation, optional backend and asset checks.
- `bundle-report.mjs BASELINE_DIST CANDIDATE_DIST`: identical Node gzip/Brotli estimates of the static initial import graph, not deployed-CDN transfer measurements.
- `results-pass2.mjs LOG_LABEL...`: extract successful CLI JSON and aggregate medians. Set `CAPTURE_BEFORE` and `CAPTURE_AFTER` to compare PNG labels; comparison bounds include all changed channels, with no visual masking.

The machine uses Chrome 153 headless, ANGLE Metal on Apple M5, DPR 1. Mobile is desktop viewport emulation, not physical-phone GPU evidence. Safari, Firefox, physical phones and high-DPR hardware remain unverified. Synthetic visibility events test scheduling but do not establish physical OS tab suspension. Deployment and Cloudflare configuration are outside this pass.
