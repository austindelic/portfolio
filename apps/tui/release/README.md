# Terminal release automation

This isolated Node 24 tool package owns semantic-release dependencies and its npm lockfile. It is intentionally outside the Bun workspace. Install with `npm ci --prefix apps/tui/release`; test with `npm test --prefix apps/tui/release`.

## Pipeline

`release-tui.yml` plans a version, stamps the temporary Cargo/npm build inputs, builds all five targets, packages both registries, and runs both package variants on every target. It retains `tested-release` only after the entire test matrix passes. Normal main pushes publish only when the repository variable `TUI_RELEASE_ENABLED` is exactly `true`. Manual `verify` runs never publish, including when that variable is enabled.

The first automated version is 1.0.0. Later ordinary relevant changes default to patch releases; conventional feature and breaking-change commits select minor and major releases. Unrelated website/root changes are excluded from commit analysis. The relevant paths in `paths.mjs` and the workflow must stay aligned with the terminal's asset inputs. Git tags use `tui-vX.Y.Z`; generated manifest changes are not committed back to main.

`packed/npm` contains `austindelic` plus `austindelic-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64}`. `packed/github` contains the same six packages under `@austindelic/`, with scoped optional dependencies. All twelve carry the same version and repository metadata. Native bytes are shared between distributions. Only the appropriate platform package is installed. This does not change the public `npx austindelic` command.

## First-time setup

1. Merge the release changes with `TUI_RELEASE_ENABLED` unset or false. Run the workflow on main with `mode=verify`. Check all five builds, both installation variants, terminal tests, graphics probes and size comparisons.
2. Populate `apps/tui/scripts/size-budgets.json` with measured launcher/native `size`, `unpackedSize` and `executableBytes` from the successful reports. Accept budgets for all six package names. Commit these measurements and run verification again. Publication refuses missing budgets or growth over 5%; both registry variants must fit the accepted limits.
3. Download **tested-release**, keeping its directory layout. For any npm companion name that does not yet exist, an authenticated npm owner must publish its exact tested archive once with `npm publish <archive> --access public --ignore-scripts`. Do not bootstrap with a local build. npm may require interactive two-factor authentication.
4. Configure a trusted publisher for **each of the six npm packages**, pointing to owner `austindelic`, repository `austindelic`, workflow `release-tui.yml`, no environment, and direct publication allowed. For each package, use the package Settings page or `npm trust github <name> --repo=austindelic/austindelic --file=release-tui.yml --allow-publish`. Complete any npm authentication prompts. No npm publishing token is stored in GitHub.
5. Set the GitHub repository Actions variable `TUI_RELEASE_ENABLED=true`. Run `mode=recover`, giving the verification run ID from step 2. This activates that tested release without rebuilding the bootstrap archives. When no tag exists yet, semantic-release rechecks the planned version before creating it. Keep main at that tested revision during bootstrap; if analysis has changed, the workflow stops rather than replacing an existing version.
6. After initial publication, open each of the six GitHub package settings and set visibility to **public**. GitHub defaults new packages to private. Their repository metadata links them to the repository's Packages sidebar. Verify that `npx austindelic@<version>` works from npm and that authenticated `npx @austindelic/austindelic@<version>` works with the GitHub scope configured.

The publishing jobs use GitHub-hosted runners, `id-token: write` for npm trusted publishing, `packages: write` for GitHub Packages, and `contents: write` for release tags and GitHub Releases. The npm config contains only a variable reference to the ephemeral GitHub token, restricted to GitHub's registry. GitHub Releases contain notes and package links; the workflow never comments on issues or PRs.

## Recovery

In Actions → Release terminal portfolio → Run workflow, choose **main**, **recover**, and the original workflow run ID. Do this after the original run finishes. The original run must belong to this repository, target main, use this workflow, and have completed `tested-bundle` successfully.

Recovery validates the source revision and all archive hashes, checks out that original revision, and uses its locked release tooling. If the release tag already exists, it must point at that same revision. Existing package versions are skipped only if their registry integrity matches; a mismatch fails. Native dependencies must become readable before the launcher is published. The GitHub Release is created or updated only after both registries succeed. Recovery refuses to publish behind a newer release tag.

Artifacts are retained for 90 days. If they expire, do not rebuild and overwrite that version; prepare a new release. A failed publication can leave a tag and a subset of packages published: rerunning normal analysis alone does not repair that state, so use recovery with the original run ID.

## Local verification

- `npm test --prefix apps/tui/release` exercises semantic-release dry runs against a local Git remote, commit filtering/version selection, both package layouts with real npm installation for all five OS/CPU combinations, size gates, integrity failures and partial-publish retries. Its native fixtures are not executable and do not replace platform CI.
- `node --test apps/tui/scripts/tests/npm-launcher.test.cjs` checks launcher behavior.
- Run actionlint against `.github/workflows/release-tui.yml` and the asset synchronization check before pushing.
- The full platform workflow is required before publication; local tests do not establish Windows/Linux runtime or GPU correctness.
