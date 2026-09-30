# Web portfolio

Astro application for [austindelic.com](https://austindelic.com), in the `austindelic/portfolio` repository.

From the repository root, run `bun install --frozen-lockfile`, then `bun run dev` or `bun run build`.

Pages, blog Markdown, profile data, resume, typography, camera routes, mobile static artwork, and Explore controls live here. `@austindelic/blackhole` 0.1.0 owns the graphics runtime. `BlackHoleBackground.astro` lazily mounts it only on eligible desktop viewports and preserves it across Astro navigation.

Run `bun run --cwd apps/portfolio test:performance` for integration lifecycle checks. For browser acceptance, start the site and run `playwright-cli open http://127.0.0.1:4321/`, compile the check with `node --import tsx tooling/prepare-browser.ts apps/portfolio/tests/explore-settings.browser.ts`, then pass its output path to `playwright-cli run-code --filename=...`; inspect `playwright-cli console` and `playwright-cli requests`. Renderer unit tests and shader parity checks live in Blackhole.

The default appearance has a pure-white sky and blue ASCII shading. A Bun patch for the pinned renderer adds `appearance: "white-blue"`; omitting it retains Blackhole's source appearance. The patch preserves traced opacity and captured-ray status through the display passes, then composites blue ink over white after ASCII analysis. Its GLSL and WGSL transformations are specific to 0.1.0 and fail if a shader marker changes. Both package source and its published JavaScript are patched; `bun install --frozen-lockfile` applies the patch on fresh installs.

To check this appearance, compile and run `tests/white-blue-renderer.browser.ts` and `tests/white-blue-theme.browser.ts` through the same browser workflow. The renderer check captures both backends in ASCII, continuous, cell, and default source modes. From the repository root, run `node --import tsx --test apps/portfolio/scripts/perf/white-blue-pixels.ts` to validate those screenshots. The theme check covers route navigation, contrast, focus, mobile, no JavaScript, and unavailable GPU fallback. WebGPU pixels are checked from compositor screenshots because reading a canvas after presentation can read an expired swap texture.

`public/images/black-hole-white-blue.webp` is a lossless 1200×1200 render of the same scene for mobile and loading/failure states. Regenerate it after the renderer browser check with `mise exec -- bun -e 'import sharp from "./apps/portfolio/node_modules/sharp/lib/index.js"; await sharp(".playwright-cli/white-blue-webgl2-ascii.png").webp({lossless:true,effort:6}).toFile("apps/portfolio/public/images/black-hole-white-blue.webp")'` from the repository root. To edit the renderer patch, use `bun patch @austindelic/blackhole@0.1.0`, update the package source and matching published modules, rebuild `src/components/WhiteBlueAppearance.ts` with `bun build --target browser --outfile dist/white-blue-appearance.js` inside the prepared package, and save with `bun patch --commit @austindelic/blackhole@0.1.0`.

Shared profile content is in `src/data/portfolio.json`; posts are in `src/content/blog`. Run `node --import tsx apps/tui/scripts/sync-assets.ts` from the repository root after content or resume changes.

Originally based on the Terminus Astro template.
