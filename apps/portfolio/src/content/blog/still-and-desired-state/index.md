---
publishDate: 2026-07-07
title: "Still and Desired State"
description: "Why I am building Still as a Rust project environment manager around typed config, planning, lockfiles, and trust."
published: true
tags:
  - rust
  - tooling
  - systems
---

Still is my attempt to make a project environment feel like source code.

Most development environments are assembled through a loose pile of tools: a README, a package manager, a version manager, shell scripts, a Makefile, maybe a `.envrc`, maybe a Docker setup, maybe a few instructions everyone forgets to update.

That works until it does not.

The failure mode is familiar. A project depends on a specific runtime, a few system packages, a CLI installed through a different ecosystem, and a task that only runs if your shell has the right environment. One machine works. Another does not. The fix is usually social: ask someone what they installed, copy a command from Slack, mutate your machine, and hope.

Still is built around a different idea: describe the desired state of the project, then let the tool plan how to reach it.

The center of that is `still.toml`.

```toml
[tools]
node = "22"
go = "1.24"
rust = "stable"

[packages]
"brew:postgresql@16" = "latest"
"cargo:sqlx-cli" = "latest"
"npm:wrangler" = "latest"

[tasks]
dev = "bun run dev"
test = "bun test"
```

The file should be readable, reviewable, and safe to change in a pull request. It should not be a shell script pretending to be configuration. That distinction matters. A config file can be parsed, normalized, diffed, locked, and trusted. A script is already execution.

Still is structured as a multi-crate Rust workspace because I want the business logic to live below the interface layer.

The CLI should be thin. It parses arguments, routes commands, and presents results. The optional TUI should own terminal state and interaction. The engine should own the real work: config discovery, desired-state normalization, source selection, planning, inventory, lockfiles, install orchestration, platform behavior, and trust enforcement.

That boundary keeps the system honest. If a command works in the CLI, the same engine action should be usable from another frontend without rewriting the core logic.

The hard part is side effects.

Installing tools changes the host machine. Updating config changes a user-authored file. Writing a lockfile records state that later commands will trust. Those actions should not be mixed together casually.

Still treats install work as something to plan before executing. A request gets classified. Sources are resolved. Platform constraints are checked. The engine decides what it thinks should happen before it starts mutating anything.

```txt
request -> normalize -> resolve -> plan -> execute -> record
```

That gives the tool room to explain itself. It also makes rollback possible in places where state recording fails after an install. Rollback is not magic, and it cannot fix every ecosystem, but the architecture should at least know where the danger is.

Cross-platform behavior is another reason the engine exists. macOS, Linux, and Windows do not share the same package story. Even Linux splits quickly across apt, dnf, pacman, Flatpak, and language-specific tools. The source system in Still is feature-gated so adapters can be explicit: Cargo, npm, Homebrew, pipx, Go, Aqua, apt, dnf, pacman, winget, Flatpak.

I do not want platform behavior hidden in stringly typed conditionals. The host platform and source capabilities should be modeled directly. That makes the resolver easier to test and easier to reason about.

The trust model is the other piece I care about.

Project configuration can define executable behavior: tasks, services, environment setup, and agent instructions. If that file changes, the tool should not blindly keep trusting it. Still fingerprints config contents with SHA-256 and invalidates trust when `still.toml` changes.

That sounds strict, but it matches the risk. A development environment manager sits close to execution. It should make trust visible.

There are two kinds of edits in Still. For user-authored config, `toml_edit` is useful because comments and formatting matter. For machine-owned state like lockfiles and trust markers, serde-backed models are better because the data should be typed and predictable.

That split is small but important. Human files should stay human. Machine files should stay boring.

Still is not just a package manager. It is an environment manager for projects where setup should be explicit, reviewable, and repeatable.

The long-term shape is simple: clone a repo, inspect the desired state, approve what it wants to do, and let the project become runnable without turning your machine into archaeology.
