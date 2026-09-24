<a href="https://austindelic.com"><img src="./assets/readme/masthead.webp" width="100%" alt="Austin Delic. Software and systems. Perth, Australia. An amber ASCII black hole beside silver pixel lettering." /></a>

Software engineer in Perth. Founding Engineer at **The Next Something**.

I build production applications, Rust tooling, and graphics that run in browsers and terminals.

[Portfolio](https://austindelic.com) · [Email](mailto:austin@austindelic.com) · [LinkedIn](https://www.linkedin.com/in/austindelic) · [Résumé](https://austindelic.com/resume.pdf)

## <img src="./assets/readme/terminal.svg" width="24" height="24" alt="Terminal" /> Run it

My portfolio also runs as a native Rust app, with a GPU-rendered black hole drawn in terminal characters.

```sh
npx austindelic
```

Node 22+. macOS, Linux, or Windows. Explore with WASD; press `?` for controls and `q` to quit outside Explore. Content is embedded, so the app works offline after installation.

## Selected work

### <img src="./assets/readme/browser.svg" width="24" height="24" alt="Browser" /> This portfolio

Astro on the web; Rust, Ratatui, and wgpu in the terminal. Shared content and shaders, an explorable black hole, and a static fallback when graphics initialization fails.

[Open the website](https://austindelic.com) · [Terminal source](./apps/tui/) · [Browser renderer](./apps/portfolio/src/components/)

### <img src="./assets/readme/systems.svg" width="24" height="24" alt="Systems" /> Still

A Rust project environment manager. Typed configuration, install planning, lockfiles, and SHA-256 configuration trust, with CLI and TUI frontends over a shared async engine.

[Source](https://github.com/austindelic/still) · [Design notes](https://austindelic.com/blog/still-and-desired-state/)

### <img src="./assets/readme/tactile.svg" width="24" height="24" alt="Tactile graphics" /> Tactify

Visual learning material converted into tactile SVG graphics and guided audio for blind and low-vision users. Built at Perth Hackerhouse with Next.js, Go, and protobuf APIs.

[Build notes](https://austindelic.com/blog/building-tactify/)

---

Previously worked on healthcare payments at Scrypt Ventures with Angular, .NET, and Azure, and owned client applications from requirements through deployment and support.

<details>
<summary>Inside this repo</summary>

- [Web portfolio](./apps/portfolio/) · Astro, React, and the browser renderer.
- [Terminal portfolio](./apps/tui/) · Rust, Ratatui, and wgpu. Includes installation and development instructions.
- [Browser renderer](./apps/portfolio/src/components/) · Rendering backends and camera controls. Shader attribution lives with the shader source.
- [Infrastructure](./infra/) · Hosting configuration.

Start the web portfolio with Bun:

```sh
bun install
bun run dev
```

Open <http://localhost:4321>. For the terminal app, follow its [development instructions](./apps/tui/README.md).

</details>

<details>
<summary>on repeat</summary>

[![What I'm listening to on Spotify](https://spotify-github-profile.kittinanx.com/api/view?uid=31z44v4osse42einhriqmf46qg5q&cover_image=true&theme=novatorem&show_offline=false&background_color=121212&interchange=false&bar_color=ffa133&bar_color_cover=false)](https://github.com/kittinan/spotify-github-profile)

</details>

[Austin Develops ↗](https://youtube.com/@austindevelops)
