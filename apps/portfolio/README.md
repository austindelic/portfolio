# Web portfolio

Astro application for [austindelic.com](https://austindelic.com), in the `austindelic/portfolio` repository.

From the repository root, run `bun install --frozen-lockfile`, then `bun run dev` or `bun run build`.

Pages, blog Markdown, profile data, resume, typography, camera routes, mobile static artwork, and Explore controls live here. `@austindelic/blackhole` 0.1.0 owns the graphics runtime. `BlackHoleBackground.astro` lazily mounts it only on eligible desktop viewports and preserves it across Astro navigation.

Run `bun run --cwd apps/portfolio test:performance` for integration lifecycle checks. For browser acceptance, start the site and run `playwright-cli open http://127.0.0.1:4321/`, compile the check with `node --import tsx tooling/prepare-browser.ts apps/portfolio/tests/explore-settings.browser.ts`, then pass its output path to `playwright-cli run-code --filename=...`; inspect `playwright-cli console` and `playwright-cli requests`. Renderer unit tests and shader parity checks live in Blackhole.

Shared profile content is in `src/data/portfolio.json`; posts are in `src/content/blog`. Run `node --import tsx apps/tui/scripts/sync-assets.ts` from the repository root after content or resume changes.

Originally based on the Terminus Astro template.
