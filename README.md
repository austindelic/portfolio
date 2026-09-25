<a href="https://austindelic.com"><img src="./assets/readme/masthead-navara-contact-transparent.webp" width="100%" alt="Austin Delic. Software and systems. Perth, Australia. An amber ASCII black hole beside silver pixel lettering." /></a>

# Austin Delic’s portfolio

The source for [austindelic.com](https://austindelic.com) and the native terminal portfolio:

```sh
npx austindelic
```

Node 22+. macOS, Linux, and Windows. Content is embedded for offline use after installation; press `?` for controls.

## Develop

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:4321. Build with `bun run build`. For the CLI, run `cargo run --manifest-path apps/tui/Cargo.toml -p austindelic`.

- [Web portfolio](./apps/portfolio/): Astro pages, blog posts, Explore controls, mobile and reading behavior.
- [Terminal portfolio](./apps/tui/): Rust content, navigation, platform actions, and the `npx austindelic` launcher.
- [Infrastructure](./infra/): Cloudflare Workers Static Assets configuration for austindelic.com.
- [Release setup](./apps/tui/release/): native builds and npm/GitHub Packages publishing.

Rendering comes from versioned [Blackhole](https://github.com/austindelic/blackhole) packages: `@austindelic/blackhole`, `austindelic-blackhole`, and `austindelic-blackhole-ratatui` 0.1.0. Shader sources, graphics backends, and canonical renderer tests belong there. Portfolio camera routes remain in `apps/portfolio/src/config/black-hole-routes.json`; content and assets remain here. The private ESLint, TypeScript, and UI workspace packages support this repository.

## Verify

```sh
bun run build
bun run --cwd apps/portfolio test:performance
node --import tsx apps/tui/scripts/sync-assets.ts --check
cargo test --locked --manifest-path apps/tui/Cargo.toml --workspace
node --import tsx --test apps/tui/scripts/tests/npm-launcher.test.ts
```

See each application’s README for browser and terminal acceptance checks. Publishing Blackhole 0.1.0 must precede clean registry installation and CI; local extraction validation uses packed packages without committing local dependency paths.
