---
publishDate: 2026-09-25
title: "Rendering a Black Hole in the Browser and Terminal"
description: "How the Astro site and Rust terminal app share their content, shaders and black hole."
heroImage: "/images/site-and-terminal/browser.webp"
heroAlt: "The portfolio in a browser, with a bright ASCII black hole beside Austin’s profile, projects and blog."
published: true
tags:
  - astro
  - rust
  - graphics
---

This portfolio has two interfaces: an Astro website and a native Rust terminal app. They share the content and black-hole shaders. The terminal version renders the scene as coloured characters, with Ratatui drawing the interface over it.

## The website

Astro builds the profile, projects and Markdown posts into static pages. The black hole runs separately in the browser. Open **explore** to move the camera without the page covering the scene, or leave it running behind the content.

The site uses Departure Mono, a black and orange interface, and Ayu Dark for code. On mobile, the background is a still image, so reading a post doesn't start the GPU renderer.

## The terminal version

The native app uses `wgpu` for graphics, Ratatui for layout and Crossterm for input. The GPU renders offscreen. Its output becomes terminal characters and RGB colours rather than pixels in a window.

![A live GPU render in the terminal’s Explore view at 160 columns by 50 rows, showing the complete black-hole shadow and bright accretion disc without the portfolio panel.](/images/site-and-terminal/terminal.webp)

*The native GPU renderer in Explore, captured at 160×50 cells using Departure Mono and true colour.*

The profile, blog and links are still available through the navigation. Tab moves focus, Enter opens an item, and `?` shows the controls. Explore uses WASD to move and IJKL to look around. Ctrl-C quits from any screen.

The website's JSON and Markdown files are copied into the TUI at build time. That keeps both versions on the same source while letting the terminal app run offline. An installed copy keeps the content from its build; opening an external link hands it to the default browser.

## What the shaders do

The native renderer runs six passes: the black-hole scene, three bloom passes, the display image, and ASCII analysis. The source is GLSL. The repository's conversion script generates WGSL for WebGPU and the Rust renderer; the browser also has a WebGL backend.

![Rendering pipeline: curved light paths and disc emission feed bloom and display colour, then glyph analysis produces character and RGB data for terminal cells.](/images/site-and-terminal/render-pipeline.svg)

*The GPU computes the scene and character choices. The terminal receives the resulting cells.*

### Light paths and the disc

`buffer-a.glsl` traces light paths through a Kerr–Newman spacetime model. The paths curve around the black hole, so light from behind it can reach the camera. That produces the bent view of the accretion disc around the dark centre.

The shader samples emission along those paths and accumulates colour and opacity. Frequency shifts affect the disc's brightness. The copper-to-ivory colour ramp is applied to disc samples before accumulation, rather than tinting the finished screen.

The underlying physics shader comes from the existing code referenced in [Buffer A](https://github.com/austindelic/blackhole/blob/main/packages/blackhole/shaders/buffer-a.glsl), including [baopinshui's NPGS](https://github.com/baopinshui/NPGS). The bloom and image passes are adapted from sonicether's “Gargantua With HDR Bloom”. Those source credits remain in the shader files.

### Bloom and display colour

Buffer B packs scaled copies of the scene for bloom. Buffers C and D blur them horizontally and vertically. Splitting the blur into two directions reduces the number of texture samples needed compared with a full two-dimensional blur.

The image pass applies exposure and compresses the scene's brightness into display colours. The browser's ASCII path adds its glow after the glyph mask, so the glow isn't applied twice. The terminal takes the display image into cell analysis and outputs foreground colours directly.

### Choosing the characters

The analysis pass samples each cell's colour and luminance, then estimates nearby edge direction. It scores candidate glyphs against measured Departure Mono coverage. Directional characters are useful on clear edges; dense characters cover brighter areas.

It also checks the previous frame. Changing a glyph adds a small scoring penalty, and a marginally better candidate won't replace the old one. This reduces flicker when the image changes only slightly. Dark cells are suppressed.

The pass writes colour and glyph-state textures. The Rust renderer copies those into readback buffers and maps them asynchronously. It decodes the glyph index and RGB bytes, then delivers the newest completed frame to the terminal. The animation grid is capped at 240×80 cells.

## Run it locally

With Git and a current Rust toolchain installed:

```sh
git clone https://github.com/austindelic/portfolio.git
cd portfolio
cargo run --manifest-path apps/tui/Cargo.toml -p austindelic
```

Use a true-colour terminal and Departure Mono to match the capture. Automatic mode keeps a static fallback if GPU initialisation fails. To request GPU rendering explicitly:

```sh
cargo run --manifest-path apps/tui/Cargo.toml -p austindelic -- --renderer gpu
```

The apps live in `apps/portfolio` and `apps/tui`. The shared renderer and shader sources live in [Blackhole](https://github.com/austindelic/blackhole), consumed here through versioned packages.
