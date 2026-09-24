---
publishDate: 2026-09-25
title: "Why I Like Contracts in Rust and C++"
description: "What contracts mean in Rust and C++, and why I like making a function’s assumptions explicit."
published: true
tags:
  - rust
  - cpp
  - engineering
---

A function can accept exactly the right type and still receive something it cannot work with. An empty list is still a list. The compiler can be happy with the call while the function has no sensible answer to give.

Usually, the missing rule ends up in a comment, an assertion inside the body, or the caller's head. I like contracts because they give that rule a place beside the function itself.

Take a function that finds the position of the smallest item in a collection. It needs at least one item. That is its precondition: something the caller must satisfy before the function runs. When it returns normally, the position must be within the collection's bounds. That is a postcondition: something the function promises about its result.

Those conditions do not fully describe the function. It could return a valid position pointing to the wrong item. But they make two useful expectations explicit, and checking them can catch a broken assumption at the call or return boundary.

That is the basic idea of a contract. The idea has been around for decades. What interests me now is the language support being developed around it.

## Where C++ and Rust stand

[Contracts were adopted for C++26](https://herbsutter.com/2025/02/17/trip-report-february-2025-iso-c-standards-meeting-hagenberg-austria/) in February 2025. They let you express preconditions and postconditions on functions, along with contract assertions inside a function body. Compiler support and checking configuration still matter; adoption into the language does not mean every toolchain already supports the feature.

Rust is at an earlier stage. Its [built-in contracts work is still experimental](https://github.com/rust-lang/rust/issues/128044), behind a feature gate, with design questions still open. I would not describe it as a new stable Rust feature you can start depending on. The compiler also has an experimental [contract-checks flag](https://doc.rust-lang.org/unstable-book/compiler-flags/contract-checks.html) for runtime precondition and postcondition checks, currently off by default.

The two languages are working on related ideas, but they are not shipping the same feature at the same level of maturity.

## Why I like the direction

When I read a function, I want to know what I am allowed to pass in without working backwards through its implementation. A comment helps, but it depends on someone keeping it accurate. An explicit condition gives both readers and tools something more precise to work with.

This also matters in Rust. Memory safety does not tell you whether a list is sorted or whether two collections have matching lengths. Types can encode some of those rules, and I would still reach for a suitable type where it makes the API clearer. Contracts offer another way to express relationships between values.

I find the review angle especially useful. Seeing an expectation beside a function gives me a specific question to ask: does every caller establish this? If the implementation changes, does it still keep its promise?

There are limits. Runtime checks only cover executions that happen, and [C++ contract checking can use different evaluation semantics](https://eel.is/c++draft/basic.contract), including ignoring checks. A contract is not an automatic proof of correctness or a way to make unsafe code safe.

I would also keep ordinary input validation. An empty collection submitted by a user may deserve a helpful error rather than a contract violation. The application should handle that before calling an internal function that requires data.

What appeals to me is being able to open a function and see its expectations immediately, then have tools check those expectations where supported. That makes the next call site easier to write and the next review easier to reason through.
