# CLAUDE.md

## Caveman Mode

ALWAYS use caveman skill. Every response. No exceptions. Invoke on session start.

## Check Scripts

Run these to verify code before claiming done:

```bash
# Root — type check + lint all packages
bun run check-types
bun run lint

# Portfolio
cd apps/portfolio && bun run check-types && bun run lint

# UI package
cd packages/ui && bun run check-types && bun run lint

# Format check
bun run format --check
```

## Dev Loop Protocol

For every task, follow this loop exactly:

1. **Explore** — read codebase, understand structure, find relevant files
2. **Plan** — state what you will change and why (caveman style)
3. **Apply** — make edits
4. **Check** — run ALL check scripts (`bun run check-types`, `bun run lint`, `bun run build`)
5. **Playwright verify** — open browser with `playwright-cli`, navigate to relevant page, verify changes look/work correct
6. **Loop or done** — if check or playwright fails, go back to step 3. If all pass, say "done."

Never claim done without passing all checks AND playwright verification.

## Stack

- Turborepo monorepo (bun workspaces)
- Apps: `portfolio` (Astro)
- Packages: `@repo/ui` (React components), `eslint-config`, `typescript-config`
- Linting: Biome (root), ESLint (packages)
- Types: TypeScript strict

## Key Commands

```bash
bun run build        # build all via turbo
bun run dev          # dev all
bun run lint         # lint all
bun run lint:biome   # biome check all
bun run check-types  # typecheck all
bun run check        # ALL checks (types + lint + biome + format)
bun run format       # prettier format
bun run ci           # full check + build (pre-PR gate)
```

## Notes

- `turbo` not in PATH directly — use `bun run <script>` or `bunx turbo`
- Portfolio uses `astro check` for types (not tsc)
- Biome handles formatting + linting at root; ESLint handles `packages/ui`
