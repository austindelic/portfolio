# Portfolio hosting

`austindelic.com` runs on the existing Cloudflare Worker **austindelic**, using Workers Static Assets. The account has no Pages projects. The earlier Pages/OpenTofu configuration was never applied and has been retired.

The root `wrangler.jsonc` preserves the Worker name and compatibility date (2026-09-21), serves `apps/portfolio/dist`, and uses the generated `404.html` for missing paths. It does not declare DNS records or custom-domain routes. Preserve the existing austindelic.com binding when deploying; do not create a Pages project.

Build from the repository root:

```sh
bun install --frozen-lockfile
bun run build
```

Deployment is a separate operation, performed by the coordinator after review. Use the existing Cloudflare account and Worker with Wrangler 4. The GitHub source repository is `austindelic/portfolio`; root lockfile installation and the Astro build are required before uploading assets. Do not add publishing to pull-request checks.

Before a deployment, record the active version and verify the custom-domain binding. The version observed during migration was `69f79742-a83f-4e7a-b528-d09229a86bf2`. After deployment verify home, blog and articles, socials, fonts, resume PDF, missing-path HTTP 404, mobile fallback, Explore, and browser errors. Rollback uses the Worker version history.

Credentials stay in environment variables or the local Wrangler login. No infrastructure or deployment changes are performed by the validation command:

```sh
node --import tsx --test infra/tests/hosting.test.ts
```

The terminal portfolio remains independently distributed through `npx austindelic`; see `apps/tui/release/README.md`.
