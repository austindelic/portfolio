#!/usr/bin/env bash
set -euo pipefail
: "${RUST_TARGET:?Set RUST_TARGET}"
: "${NPM_TARGET:?Set NPM_TARGET}"
manifest=apps/tui/Cargo.toml
cargo test --locked --manifest-path "$manifest" -p tui-core -p tui-renderer -p austindelic --target "$RUST_TARGET"
cargo build --locked --release --manifest-path "$manifest" -p austindelic --target "$RUST_TARGET" --bin austindelic --example pty-smoke
cargo build --locked --release --manifest-path "$manifest" -p tui-renderer --target "$RUST_TARGET" --example probe
suffix=
if [[ "$NPM_TARGET" == win32-* ]]; then suffix=.exe; fi
mkdir -p "release/native/$NPM_TARGET" "release/test/$NPM_TARGET"
cp "apps/tui/target/$RUST_TARGET/release/austindelic$suffix" "release/native/$NPM_TARGET/"
cp "apps/tui/target/$RUST_TARGET/release/examples/pty-smoke$suffix" "release/test/$NPM_TARGET/"
cp "apps/tui/target/$RUST_TARGET/release/examples/probe$suffix" "release/test/$NPM_TARGET/"
