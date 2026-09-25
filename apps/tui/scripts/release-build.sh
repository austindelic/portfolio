#!/usr/bin/env bash
set -euo pipefail
: "${RUST_TARGET:?Set RUST_TARGET}"
: "${NPM_TARGET:?Set NPM_TARGET}"
manifest=apps/tui/Cargo.toml
cargo test --locked --manifest-path "$manifest" -p tui-core -p austindelic --target "$RUST_TARGET"
# Preserve the unoptimized release baseline independently of the release profile.
CARGO_PROFILE_RELEASE_OPT_LEVEL=3 CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 CARGO_PROFILE_RELEASE_STRIP=none cargo build --locked --release --manifest-path "$manifest" -p austindelic --target "$RUST_TARGET" --bin austindelic
suffix=
if [[ "$NPM_TARGET" == win32-* ]]; then suffix=.exe; fi
mkdir -p "release/baseline/$NPM_TARGET" release/measurements
cp "apps/tui/target/$RUST_TARGET/release/austindelic$suffix" "release/baseline/$NPM_TARGET/"
baseline="release/baseline/$NPM_TARGET/austindelic$suffix"
printf '{"executableBytes":%s,"gzipBytes":%s}\n' "$(wc -c < "$baseline" | tr -d ' ')" "$(gzip -c "$baseline" | wc -c | tr -d ' ')" > "release/measurements/$NPM_TARGET.json"
cargo build --locked --release --manifest-path "$manifest" -p austindelic --target "$RUST_TARGET" --bin austindelic --example pty-smoke
cargo build --locked --release --manifest-path "$manifest" -p austindelic --target "$RUST_TARGET" --example probe
suffix=
if [[ "$NPM_TARGET" == win32-* ]]; then suffix=.exe; fi
mkdir -p "release/native/$NPM_TARGET" "release/test/$NPM_TARGET"
cp "apps/tui/target/$RUST_TARGET/release/austindelic$suffix" "release/native/$NPM_TARGET/"
cp "apps/tui/target/$RUST_TARGET/release/examples/pty-smoke$suffix" "release/test/$NPM_TARGET/"
cp "apps/tui/target/$RUST_TARGET/release/examples/probe$suffix" "release/test/$NPM_TARGET/"
