---
publishDate: 2026-09-25
title: "Contracts in Rust, by Example"
description: "Rust contracts in code: preconditions, postconditions, runtime checks, and a tiny C++ comparison."
published: true
tags:
  - rust
  - cpp
  - engineering
---

Contracts put a function’s requirements and promises beside its signature.

[Experimental, nightly-only](https://doc.rust-lang.org/unstable-book/language-features/contracts.html); [runtime checks](https://doc.rust-lang.org/unstable-book/compiler-flags/contract-checks.html) are off by default. Tested with nightly-2026-09-24.

## Require input, promise a minimum

```rust
// Save as contracts.rs.
#![feature(contracts)]

use core::contracts::{ensures, requires};

// Before the body: the caller must supply at least one value.
#[requires(!values.is_empty())]
// After a normal return: check both the index and its value.
// `index` is a reference to the return value.
#[ensures(move |index: &usize| {
    *index < values.len()
        && values.iter().all(|value| values[*index] <= *value)
})]
// Copyable arrays avoid current borrowed-capture limitations.
// `move` copies the array into the postcondition closure.
fn min_index<const N: usize>(values: [i32; N]) -> usize {
    let mut smallest = 0;

    for index in 1..values.len() {
        if values[index] < values[smallest] {
            smallest = index;
        }
    }

    smallest
}

fn main() {
    let values = [8, 3, 5];
    let index = min_index(values);
    assert_eq!(index, 1);
    assert_eq!(values[index], 3);

    // One element is enough.
    assert_eq!(min_index([42]), 0);

    // Negative values and ties are fine.
    assert_eq!(min_index([4, -2, -2]), 1);
    println!("All contracts satisfied.");
}
```

```sh
rustup toolchain install nightly-2026-09-24 --profile minimal
rustup run nightly-2026-09-24 rustc contracts.rs \
  --edition=2024 -Z contract-checks=yes -o contracts
./contracts
# All contracts satisfied.
```

## Break the precondition

```rust
// Replace main(), then rebuild with the same command.
fn main() {
    // Compiles, but fails the non-empty check at runtime.
    // The function body never runs.
    min_index([]);
}
```

## Break the postcondition

```rust
// Keep the attributes; replace min_index's implementation.
fn min_index<const N: usize>(values: [i32; N]) -> usize {
    // In bounds for non-empty input, but not always the minimum.
    0
}

// Replace main(), then rebuild with checks enabled.
fn main() {
    min_index([8, 3, 5]); // Fails: 8 is greater than 3.
}
```

## A tiny C++ comparison

[C++26 declaration](https://eel.is/c++draft/dcl.contract.func), requiring compiler support:

```cpp
#include <algorithm>
#include <cstddef>
#include <span>

std::size_t min_index(const std::span<const int> values)
    pre (!values.empty())
    post (index: index < values.size()
        && std::ranges::all_of(values, [=](int value) {
            return values[index] <= value;
        }));
```
