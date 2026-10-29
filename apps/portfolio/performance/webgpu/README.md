# WebGPU port and acceptance record

Recorded 2026-09-23. `auto` now attempts the native WebGPU renderer, including
`ascii-cell`. Explicit WebGL2 remains supported. A failed WebGPU session falls
back once to WebGL2 on a fresh canvas, preserving shared camera, settings and
animation state. Both backends failing uses the existing error state.

## Implementation

The reference is the production Buffer A history → optional B/C/D bloom → image
composition → ASCII analysis/output pipeline. The previously approximate WebGPU
scene has been removed. The formerly unused optimized GL pipeline is not revived.

`BlackHoleRuntime.ts` owns animation, input, navigation, visibility and history
policy. `BlackHoleBackend.ts` defines the resource interface. Native GPU and GL
implementations are lazy imports; the editor and benchmark remain separate chunks.
The Astro mount replaces the canvas when ownership changes; the React editor owns
its canvas through a stable wrapper. Ordinary route navigation retains the device
and canvas. Reduced-motion changes now correctly resume rendering when disabled.

The dedicated WGSL preserves the effective GLSL transformations, f32 arithmetic,
half-float history/scene targets, byte ASCII history, sampling, bloom and glyph atlas.
Offscreen row indexing follows GL; only presentation flips Y. Bloom shaders and
resources are prepared before displaying a contributing frame. Zero bloom skips
those passes; resources and bind groups are reused. Normal rendering performs no
readbacks or completion waits. Optional diagnostics explicitly request timestamp
queries and asynchronously read them; they are disabled in the production benchmark.

WGSL was translated **offline**, with Naga CLI 27.0.0 / library 27.0.3, then compiled
and exercised in Chrome. No shader translator or rendering framework ships at
runtime. The GLSL is the readable source of truth; `sources.json` records hashes
and a test rejects stale generated shaders. The conversion explicitly handles
samplers, NaN/infinity bit tests, derivative uniformity and presentation orientation.
It also expands the GLSL comma expression in `rune_line`: Naga otherwise discarded
its first side effect, causing antiverse geometry differences caught by comparison.
The generated arithmetic is kept intact by the whitespace compactor's token test.
See the [WGSL specification](https://www.w3.org/TR/WGSL/) for language semantics.

## Visual evidence

- All **62 paired comparisons passed**, including actual rendered frames 30/60/120/420.
  Worst mean absolute error: **0.1322/255**; worst fraction above 2/255: **0.0839%**.
- [Numerical comparisons](parity.json), with [resolved settings and capture paths](parity-raw.json).
- [Original production GL vs extracted GL](webgl-reference.json): zero differing
  channels at the three captured mobile milestones.
- [Intermediate target samples](intermediates.json): HDR scene, bloom, composition
  and both ASCII history attachments, captured against the original GL build.
- [GL capture](webgl2.png), [GPU capture](webgpu.png), [difference amplified 8×](difference-8x.png).

Comparisons freeze time, camera, viewport and fonts. The matrix covers 1440×900,
2560×1440, 390×844 and desktop DPR 2, startup/temporal warm-up, route transitions,
all quality presets, bloom zero/positive, ASCII disabled/mixed/enabled, custom
font/glyphs/palette, jitter, antiverse and optional cell rendering. Original `home`
milestones count deterministic 60 Hz callbacks; `rendered-home` milestones count
actual rendered frames through frame 420. Both record actual frame and shader time.
The cadence remains unchanged.

The numerical guard requires mean absolute channel error ≤0.2/255 and fewer than
0.1% of channels differing by more than 2/255, with identical frame/time and an
actual GPU backend. This supplements visual review rather than proving every pixel
identical: tiny floating-point differences occasionally cross discrete glyph
selection thresholds, producing sparse larger channel deltas. Captures and 8×
difference PNGs for every pair remain under the workspace's ignored
`.playwright-cli/` directory; the report records their paths. Representative images
above are retained with the report.

## Production measurements

Five interleaved trials per backend/viewport, fixed camera and time scale, identical
resolved settings, 120 animation callbacks of warm-up, then 2.5 seconds of sampling.
Fresh browser contexts; production builds; profiling disabled. Values below are
medians of per-trial measurements. Frame intervals measure submitted animation
frames, not independent GPU execution time. Startup is navigation-to-first-draw
submission, not time to first displayed pixel. CPU timings have browser timer
quantization and must not be interpreted as GPU timings.

| Viewport | Backend | First draw ms | Median frame interval ms | P95 interval ms | Median CPU submission ms |
|---|---|---:|---:|---:|---:|
| 1440×900 | WebGL2 | 131.1 | 33.3 | 50.0 | 0.1 |
| 1440×900 | WebGPU | 155.3 | 33.3 | 33.4 | 0.1 |
| 2560×1440 | WebGL2 | 330.9 | 83.3 | 116.6 | 0.1 |
| 2560×1440 | WebGPU | 297.4 | 66.7 | 100.0 | 0.1 |
| 390×844 | WebGL2 | 214.6 | 16.7 | 33.4 | 0.0 |
| 390×844 | WebGPU | 232.8 | 16.7 | 16.8 | 0.1 |

[Summary/trials](performance.json) and [raw frame samples/settings](measurements.json).
This run supports improved frame pacing on this machine, particularly at 2560×1440,
but not a universal speedup: startup is mixed and median intervals at the other
sizes are unchanged. No resolution, precision, sampling or effect reductions were
introduced to obtain these results.

A separate [profiled run](profiled-performance.json), with
[raw samples](profiled-measurements.json), records optional GPU timestamps and
estimated texture memory. Its desktop tail latency is worse for GPU despite shorter
median intervals. Readback instrumentation and run-to-run variation matter, so the
unprofiled results above represent normal operation. Texture-memory numbers are
estimates, not total driver/process memory; GL GPU timing is unavailable in this
harness. Timestamp values are samples, not a cross-backend GPU-time comparison.

## Stability and coverage

[Lifecycle results](lifecycle.json) cover retained resources across navigation,
resize, reduced-motion pause/resume, simulated visibility changes, missing API or
adapter, device/pipeline/allocation failures, late device loss, unmount during
initialization and both backends unavailable. Tracked GPU textures are released.
[Editor results](editor.json) cover repeated entry/exit, manual backend switching,
GL context loss/recovery, bloom, ASCII/font/glyph/palette edits, benchmark
cancellation during navigation, history navigation and 404. No unexpected console
errors or failed requests were reported. [Camera results](camera.json) also verify
position/forward/universe edits, keyboard movement and animation play/pause.

Tested browser: Chrome 153.0.8010.48 on the local macOS host (adapter: apple / metal-3). Mobile viewport and
DPR are emulation, not physical phone coverage. Safari and Firefox were not
available in this automation environment and are **not verified**. Visibility was
injected; background-tab throttling and physical-device thermal/memory behavior
remain outside this run. Benchmark runs are local, short-duration evidence, not a
multi-device performance guarantee.

Verification: 20 Node performance/runtime/source tests, 3 Bun tests (12 assertions),
source TypeScript, changed component lint, shader compilation and production build
passed. Full-project TypeScript still reports the pre-existing missing `bun:test`
type declaration in the test file; source-only checking passes.

## Reproduction

Run from the repository root after installing locked dependencies:

```sh
node --test apps/portfolio/scripts/perf/*.test.mjs
bun test apps/portfolio/tests
bun run --cwd apps/portfolio build
# Start a production preview, open it in Playwright CLI, then:
TMPDIR=/private/tmp bunx @playwright/cli -s=gpu-reference run-code --filename=apps/portfolio/scripts/perf/webgpu-parity.js
```

The parity harness uses the current tab's origin. Query `?matrix=routes` selects
route cases; `?matrix=rendered` checks actual rendered-frame milestones and zero
bloom. The default runs the settings/viewport matrix. Capture CLI output to a file
and run `webgpu-report.mjs <log>` to generate numerical comparisons. The lifecycle,
editor, intermediate and measurement harnesses use the same CLI invocation style.
Run measurements alone, without simultaneous GPU workloads. `?profile=1` enables
timing instrumentation; `webgpu-measure-report.mjs <log>` writes its report.
Intermediate capture expects the untouched reference on port 4399 and candidate on
4322. Preserve a pre-change production build to reproduce that comparison.

Regenerate WGSL only when GLSL or its effective source transformations change:

```sh
cargo install naga-cli --version 27.0.0 --root /private/tmp/black-hole-naga
node packages/black-hole/tooling/webgpu/port-shaders.mjs /private/tmp/black-hole-naga/bin/naga
```

Re-run shader compilation, parity and source-hash tests after regeneration. Browser
harness files are Playwright function expressions; do not append a final semicolon.
