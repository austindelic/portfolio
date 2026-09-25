# Shared black-hole assets

Private workspace package `@repo/black-hole`, shared by the website and native TUI. It owns GLSL sources (including the fragment header and camera helpers), generated WGSL, the uniform layout, and authored camera presets. Platform rendering and animation controllers stay in their apps.

The website imports `@repo/black-hole/shaders/<file>?raw`, `@repo/black-hole/shaders/webgpu/uniform-layout.json`, and `@repo/black-hole/routes.json`. No package compilation or runtime dependencies are required. Its build task validates source hashes so Turbo tracks shared inputs before building the website.

## Editing

Edit GLSL, not generated files under `shaders/webgpu`. The standalone `shaders/ascii-analysis.wgsl` is the existing hand-authored analysis shader used by browser parity tests; it is separate from generated WebGPU passes.

From the repository root, regenerate with the existing pinned compiler:

```sh
cargo install naga-cli --version 27.0.0 --locked --root /tmp/black-hole-naga
node --import tsx packages/black-hole/tooling/webgpu/port-shaders.ts /tmp/black-hole-naga/bin/naga
node --import tsx apps/tui/scripts/sync-assets.ts
node --import tsx --test packages/black-hole/tests/*.test.ts
node --import tsx apps/tui/scripts/sync-assets.ts --check
```

Keep generated shaders and TUI copies committed. The TUI embeds its copies, allowing standalone Cargo builds without Node or this package at build/runtime. The sync check and source-hash tests run in CI. Preserve shader source notices and LF line endings.
