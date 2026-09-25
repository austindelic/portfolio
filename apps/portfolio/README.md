# 🌱 Terminus

> A minimalist Astro template for developers

![Preview of template](./preview.png)

## ✨ Features

- 🚀 **Astro 5.x** - Fast, content-focused web framework
- 🎨 **Tailwind CSS** - Utility-first CSS framework
- 📱 **Responsive Design** - Mobile-first approach
- 📝 **Blog Ready** - Built-in blog functionality with markdown support
- 🚀 **GitHub Pages Deployment** - Automated deployment via GitHub Actions

## 🛠️ Prerequisites

- **Node.js** 18+
- A computer (optional)

## 🚀 Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/ojoanalogo/terminus-astro-template.git
   cd terminus-astro-template
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:4321` to see your site!

## 📁 Project Structure

```txt
terminus/
├── public/              # Static assets (favicon, images, etc.)
├── src/
│   ├── components/     # Reusable Astro components
│   │   ├── BaseHead.astro
│   │   ├── Header.astro
│   │   ├── PostPreview.astro
│   │   └── ...
│   ├── content/        # Content collections (blog posts, etc.)
│   │   ├── blog/       # Blog posts in markdown
│   │   └── config.ts   # Content collection configuration
│   ├── layouts/        # Page layouts
│   │   ├── BaseLayout.astro
│   │   └── PostLayout.astro
│   ├── pages/          # File-based routing
│   │   ├── blog/       # Blog pages
│   │   ├── index.astro # Homepage
│   │   └── 404.astro   # Custom 404 page
│   ├── styles/         # Global CSS styles
│   ├── utils/          # Utility functions
│   └── config.ts       # Site configuration
├── astro.config.ts    # Astro configuration
└── package.json        # Dependencies and scripts
```

## 🎨 Customization

### Site Configuration

Edit `src/config.ts` to customize your site:

```typescript
export const SITE_TITLE = "Your Site Title";
export const SITE_DESCRIPTION = "Your site description";
```

### Astro Configuration

Modify `astro.config.ts` to:

- Update the site URL for production
- Add new integrations
- Configure build options

## 📝 Adding Content

### Blog Posts

Create new blog posts in `src/content/blog/`:

```markdown
---
title: "Your Post Title"
description: "Post description"
pubDate: "2024-01-15"
---

Your content here...
```

### Pages

Add new pages in the `src/pages/` directory. Astro uses file-based routing:

- `src/pages/about.astro` → `/about`
- `src/pages/contact/index.astro` → `/contact`

## 🚀 Deployment

This template is configured for **automatic deployment to GitHub Pages** using GitHub Actions.

### Setup GitHub Pages Deployment

1. **Fork or use this template** to create your repository
2. **Enable GitHub Pages** in your repository settings:
   - Go to Settings → Pages
   - Select "GitHub Actions" as the source
3. **Update the site URL** in `astro.config.ts`:

   ```javascript
   export default defineConfig({
     site: "https://yourusername.github.io/your-repo-name",
     // ... other config
   });
   ```

4. **Push to main branch** - deployment happens automatically!

## 📄 License

MIT

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## Shared graphics

Black-hole shaders and camera presets live in [`packages/black-hole`](../../packages/black-hole/README.md), imported through `@repo/black-hole`. Run dependency installation from the repository root. Shader generation is explicit; normal builds use committed WGSL and validate its source hashes.

### TypeScript tooling

From the repository root, run `bun install --frozen-lockfile` and `npm ci --prefix apps/tui/release`, then `bun run check-types`. All authored scripts and configuration use TypeScript; Node scripts use `tsx`.

Playwright CLI evaluates JavaScript function expressions. Compile a browser audit before passing it to `run-code`:

```sh
bun run --silent prepare:browser apps/portfolio/tests/quality-presets.browser.ts
playwright-cli run-code --filename=.playwright-cli/compiled/apps/portfolio/tests/quality-presets.browser.js
```

Compiled audits stay under the ignored `.playwright-cli` directory. The TUI launcher similarly compiles from `apps/tui/npm/bin/cli.ts` to its existing npm entry point during packaging; `bun run build:launcher` generates it for local launcher tests.
