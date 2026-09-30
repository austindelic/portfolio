# Web portfolio

Astro application for [austindelic.com](https://austindelic.com), in the `austindelic/portfolio` repository.

From the repository root, run `bun install --frozen-lockfile`, then `bun run dev` or `bun run build`.

Pages, blog Markdown, profile data, resume, typography, camera routes, mobile static artwork, and Explore controls live here. `@austindelic/blackhole` 0.1.0 owns the graphics runtime. `BlackHoleBackground.astro` lazily mounts it only on eligible desktop viewports and preserves it across Astro navigation.

Run `bun run --cwd apps/portfolio test:performance` for integration lifecycle checks. For browser acceptance, start the site and run `playwright-cli open http://127.0.0.1:4321/`, compile the check with `node --import tsx tooling/prepare-browser.ts apps/portfolio/tests/explore-settings.browser.ts`, then pass its output path to `playwright-cli run-code --filename=...`; inspect `playwright-cli console` and `playwright-cli requests`. Renderer unit tests and shader parity checks live in Blackhole.

Shared profile content is in `src/data/portfolio.json`; posts are in `src/content/blog`. Run `node --import tsx apps/tui/scripts/sync-assets.ts` from the repository root after content or resume changes.

Originally based on the Terminus Astro template.

## Portrait experiments

`/portrait-lab` is an unlisted, noindex contact sheet with twelve portrait treatments, six palettes and five homepage placements. Select a study to tune its grain, contrast, brightness, crop and optional effects. Preview on Homepage opens the real page; Back to Lab retains the configuration. Copy Preview Link shares the complete combination. The ordinary homepage stays unchanged and does not load portrait artwork or its renderer.

Preview settings are browser query parameters: `portrait` (preset ID), `palette`, `placement`, `grain`, `contrast`, `brightness`, `crop`, and `scanlines`, `tilt`, `reveal` (each `0` or `1`). For example, `/?portrait=amber-bayer&placement=side` opens the default amber treatment beside the introduction. Invalid values fall back to preset defaults; numeric controls are bounded.

Run `mise exec -- bun apps/portfolio/scripts/portrait-assets.ts` from the root to regenerate the printed studies from the optimized source. Pass a photo path as its first argument to replace that source. Static and live effects share `src/portrait/pixels.ts`; source pixels are cached per crop, and only the active portrait redraws. Motion defaults off, and reduced-motion settings disable tilt and animated reveals.

Run `mise exec -- bun test apps/portfolio/tests/portrait.test.ts` for query and renderer checks. For browser verification, build and preview the site, open `/portrait-lab` through the Playwright CLI skill, compile `mise exec -- bun tooling/prepare-browser.ts apps/portfolio/tests/portrait.browser.ts`, and use the printed path with `playwright-cli run-code --filename=...`. This exercises all treatments, palettes and placements, mobile layouts, reloads, client navigation, clipboard links and static fallbacks; screenshots are saved in `.playwright-cli/`.
