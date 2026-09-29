# Black hole renderer patch

The portfolio uses the pinned `@austindelic/blackhole@0.1.0` package. Its theme patch adds a third palette mode that colors disk and jet emission before bloom, and clears render history when colors change. Original and custom ASCII modes retain their existing behavior.

The patch includes compiled browser assets because the published package runs from `dist/`. To regenerate it, start from the renderer's `v0.1.0` source tag, apply the `src/` and `shaders/` changes in this patch, run its WebGPU shader generator with Naga 27.0.0, run `scripts/build.mjs`, copy the generated files into a `bun patch @austindelic/blackhole@0.1.0` checkout, then run `bun patch --commit`.
