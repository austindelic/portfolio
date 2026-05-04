# tui

Interactive terminal portfolio — runs as an SSH server and as a browser app.

## Structure

```
apps/tui/
├── core/   shared app logic, data, and all TUI rendering (tui-core)
├── ssh/    SSH server via russh — runs the TUI over a real terminal session
└── wasm/   Browser app via ratzilla/WASM — same TUI rendered in the browser
```

All screens and content live in `core/`. The SSH and WASM crates are thin
adapters that translate their respective input formats into `InputEvent`.

## Running

**SSH server**
```bash
cargo run --bin tui
ssh localhost -p 2323 -o StrictHostKeyChecking=no
```

**Browser (requires [trunk](https://trunkrs.dev))**
```bash
cd wasm
trunk serve
```

## License

Copyright (c) Austin Delic <austin@austindelic.com>

Licensed under the MIT license ([LICENSE](./LICENSE)).
