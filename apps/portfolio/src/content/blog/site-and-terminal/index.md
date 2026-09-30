---
publishDate: 2026-09-25
title: "A black hole in the browser and terminal"
description: "Shared content and shaders in an Astro site and Rust app."
heroImage: "/images/site-and-terminal/browser.webp"
heroAlt: "An ASCII black hole beside Austin’s profile, projects and blog."
published: true
tags:
  - astro
  - rust
  - graphics
---

I built this portfolio for the browser and terminal. The Astro site and native Rust app share content and black-hole shaders. In the terminal, the scene becomes coloured characters beneath a Ratatui interface.

## The website

Astro builds the profile, projects and Markdown posts into static pages. The black hole runs in the browser. Open Explore to move the camera and hide the page.

The black and orange interface uses Departure Mono. Code uses Ayu Dark. Mobile uses a still background instead of starting the GPU renderer.

## The terminal version

The native app uses `wgpu` for offscreen graphics, Ratatui for layout and Crossterm for input. The GPU output becomes terminal characters and RGB colours.

![The black-hole shadow and accretion disc in the terminal’s Explore view.](/images/site-and-terminal/terminal.webp)

*Explore at 160×50 cells, with Departure Mono and true colour.*

Tab moves focus, Enter opens an item and `?` shows the controls. In Explore, WASD moves and IJKL looks around. Ctrl-C quits from any screen.

The TUI bundles the site's JSON and Markdown at build time and runs offline. Installed copies keep that content until updated. External links open in the default browser.

## The render pipeline

The native renderer runs six passes: the scene, three bloom passes, the display image and ASCII analysis. A conversion script turns the GLSL source into WGSL for WebGPU and Rust. The browser also supports WebGL.

![Light paths and disc emission feed bloom and display colour, then glyph analysis produces terminal characters and RGB data.](/images/site-and-terminal/render-pipeline.svg)

*The GPU renders the scene and chooses the characters.*

### Light paths and the disc

`buffer-a.glsl` traces light through a Kerr–Newman spacetime model. Light curves around the black hole, bringing the far side of the accretion disc into view around the dark centre.

The shader accumulates colour and opacity from emission along each path. Frequency shifts affect brightness. It colours each disc sample copper to ivory before accumulation.

The physics shader draws on the sources credited in [Buffer A](https://github.com/austindelic/blackhole/blob/main/packages/blackhole/shaders/buffer-a.glsl), including [baopinshui's NPGS](https://github.com/baopinshui/NPGS). The bloom and image passes adapt sonicether's “Gargantua With HDR Bloom”. Credits remain in the shader files.

### Bloom and display colour

Buffer B packs scaled scene copies for bloom. Buffers C and D blur them horizontally and vertically, using fewer texture samples than a full two-dimensional blur.

The image pass applies exposure and compresses brightness into display colours. Browser ASCII adds glow after the glyph mask to avoid applying it twice. The terminal analyses the display image and outputs foreground colours directly.

### Choosing the characters

The analysis pass samples cell colour and luminance, estimates edge direction and scores glyphs against measured Departure Mono coverage. Directional characters follow edges; dense characters fill bright areas.

A small penalty discourages glyph changes between frames. A candidate must improve enough to replace the previous glyph, reducing flicker. Dark cells are suppressed.

The Rust renderer copies colour and glyph-state textures into readback buffers and maps them asynchronously. It decodes glyph indices and RGB bytes, then sends the newest completed frame to the terminal. The grid is capped at 240×80 cells.

## Run it locally

With Git and a current Rust toolchain:

```sh
git clone https://github.com/austindelic/portfolio.git
cd portfolio
cargo run --manifest-path apps/tui/Cargo.toml -p austindelic
```

Use a true-colour terminal and Departure Mono to match the capture. Automatic mode falls back to a static image if GPU initialisation fails. To request the GPU explicitly:

```sh
cargo run --manifest-path apps/tui/Cargo.toml -p austindelic -- --renderer gpu
```

The apps live in `apps/portfolio` and `apps/tui`. Both use versioned [Blackhole](https://github.com/austindelic/blackhole) packages for the renderer and shaders.
