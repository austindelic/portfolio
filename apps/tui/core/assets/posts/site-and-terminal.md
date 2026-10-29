---
publishDate: 2026-09-25
updatedDate: "2026-10-29"
title: "I put a black hole in my portfolio"
description: "It runs in your browser and your terminal, from the same shaders."
heroImage: "/images/site-and-terminal/browser.webp"
heroAlt: "An ASCII black hole beside Austin’s profile, projects and blog."
published: true
tags:
  - astro
  - rust
  - graphics
---

Does a portfolio need a black hole? No.

I built one anyway.

It’s the background of this site, and it’s the background of the terminal version too. You can run that one right now:

```sh
npx austindelic
```

Both versions use the same content and the same shaders. Your browser draws the black hole with WebGPU. Your terminal draws it with wgpu, then turns every frame into coloured characters. This post is how all of that works.

## Two apps, one portfolio

The website is built with Astro. It turns my profile, projects and these posts into static pages, and the black hole runs behind them on your GPU.

Every page has its own camera, so moving between pages flies you somewhere new. Hit Explore and the page gets out of the way, so you can fly around it yourself with WASD.

On a phone it shows a still image instead. Reading a post on mobile shouldn’t spin up a GPU renderer.

The terminal app is written in Rust. Ratatui does the layout, Crossterm handles input and wgpu renders the black hole offscreen. The posts and profile get bundled in when it’s built, so it works offline once it’s installed.

![The black-hole shadow and accretion disc in the terminal’s Explore view.](/images/site-and-terminal/terminal.webp)

*Explore in the terminal at 160×50 cells, in Departure Mono with true colour.*

Tab moves between links, Enter opens them and `?` shows every control. In Explore, WASD moves and IJKL looks around. Ctrl-C quits from anywhere.

## How a frame gets made

Every frame goes through six passes on the GPU:

1. **The scene.** Trace light around the black hole and add up what the disc gives off along the way.
2. **Bloom, in three passes.** Shrink copies of the scene, then blur them across and then down.
3. **The display image.** Apply exposure and squash the brightness into colours a screen can show.
4. **ASCII analysis.** Pick the best character for every cell.

The shaders are written once in GLSL. A script converts them to WGSL, so the browser and the Rust app run the same code. The browser keeps a WebGL fallback for when WebGPU isn’t there.

### Bending light

The scene shader traces each ray of light through a Kerr–Newman spacetime, which is the maths for a black hole that spins and carries charge. Light that passes close to the hole curves around it. That’s why you can see the far side of the disc wrapped around the black centre.

Along each path it adds up colour and opacity from the glowing disc. Frequency shifts change how bright each part looks, and every sample gets a colour somewhere between copper and ivory.

I didn’t come up with the physics from scratch. It builds on [baopinshui’s NPGS](https://github.com/baopinshui/NPGS) and the other sources credited in [Buffer A](https://github.com/austindelic/blackhole/blob/main/packages/blackhole/shaders/buffer-a.glsl). The bloom and image passes adapt sonicether’s “Gargantua With HDR Bloom”. The credits live in the shader files.

### Bloom

Bloom is what makes the disc glow. Buffer B packs smaller copies of the scene, then buffers C and D blur them horizontally and vertically. Two one-way blurs take far fewer texture samples than one full 2D blur.

### Picking the characters

This is my favourite part.

For every cell on screen, the analysis pass looks at its colour, how bright it is and which way any edges run. Then it scores every character against how much of a Departure Mono cell that character actually fills. Edges get directional characters like `/` and `\`. Bright areas get dense ones like `8` and `A`.

On its own that would flicker, because a cell sitting between two characters swaps back and forth every frame. So changing costs a little. A new character has to be clearly better than the old one before it replaces it. Dark cells stay empty.

In the browser, the glow goes on after the characters are drawn, so it isn’t applied twice. In the terminal, the analysis output becomes foreground colours directly.

The Rust app copies the colour and character data back from the GPU without blocking, turns it into characters and RGB values, and draws the newest finished frame. The grid tops out at 240×80 cells.

## Run it

The quick way, with Node 22 or newer:

```sh
npx austindelic
```

It works on Mac, Linux and Windows. Use a terminal with true colour, and set its font to Departure Mono if you want it to look like the screenshot. If the GPU won’t start, it falls back to a still image.

From the source, with Git and Rust:

```sh
git clone https://github.com/austindelic/portfolio.git
cd portfolio
cargo run --manifest-path apps/tui/Cargo.toml -p austindelic
```

To force the GPU renderer:

```sh
cargo run --manifest-path apps/tui/Cargo.toml -p austindelic -- --renderer gpu
```

The website lives in `apps/portfolio` and the terminal app in `apps/tui`. Both pull the renderer and shaders from versioned [Blackhole](https://github.com/austindelic/blackhole) packages.

It’s all open source under GPL-3.0. If you build something with it, send it my way :)
