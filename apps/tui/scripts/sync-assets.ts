import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../..", import.meta.url));
const check = process.argv.includes("--check");
const mappings = [];
for (const name of [
  "buffer-a",
  "buffer-b",
  "buffer-c",
  "buffer-d",
  "image",
  "ascii-analysis",
])
  mappings.push([
    `packages/black-hole/shaders/webgpu/${name}.wgsl`,
    `apps/tui/renderer/assets/${name}.wgsl`,
  ]);
for (const [source, target] of [
  ["src/data/portfolio.json", "core/assets/portfolio.json"],
  ["public/resume.pdf", "core/assets/resume.pdf"],
])
  mappings.push([`apps/portfolio/${source}`, `apps/tui/${target}`]);
for (const slug of (
  await readdir(path.join(root, "apps/portfolio/src/content/blog"))
).sort())
  mappings.push([
    `apps/portfolio/src/content/blog/${slug}/index.md`,
    `apps/tui/core/assets/posts/${slug}.md`,
  ]);
mappings.push(
  [
    "packages/black-hole/shaders/webgpu/uniform-layout.json",
    "apps/tui/renderer/assets/uniform-layout.json",
  ],
  ["packages/black-hole/routes.json", "apps/tui/renderer/assets/routes.json"],
);
const hashes: Record<string, string> = {};
let failed = false;
for (const [source, target] of mappings) {
  const bytes = await readFile(path.join(root, source));
  hashes[source] = createHash("sha256").update(bytes).digest("hex");
  const dest = path.join(root, target);
  if (check) {
    try {
      if (!bytes.equals(await readFile(dest))) throw Error("changed");
    } catch {
      console.error(`Stale asset: ${target}`);
      failed = true;
    }
  } else {
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
  }
}
// Also track the inputs to the browser-calibrated metrics and GPU fallback.
for (const source of [
  "apps/portfolio/public/fonts/DepartureMono-Regular.woff2",
  "apps/portfolio/src/lib/ascii-analysis.ts",
  "apps/portfolio/src/components/BlackHoleCore.ts",
  "apps/tui/renderer/assets/glyph-metrics.json",
  "apps/tui/core/assets/fallback.json",
]) {
  hashes[source] = createHash("sha256")
    .update(await readFile(path.join(root, source)))
    .digest("hex");
}
const postsDir = path.join(root, "apps/tui/core/assets/posts");
const expected = new Set(
  mappings
    .filter((x) => x[1].includes("/posts/"))
    .map((x) => path.basename(x[1])),
);
for (const file of await readdir(postsDir)) {
  if (!expected.has(file)) {
    if (check) {
      console.error(`Obsolete post: ${file}`);
      failed = true;
    } else await rm(path.join(postsDir, file));
  }
}
const manifest = JSON.stringify(hashes, null, 2) + "\n";
const output = path.join(root, "apps/tui/assets-manifest.json");
if (check) {
  if ((await readFile(output, "utf8")) !== manifest) {
    console.error(
      "Asset manifest differs; regenerate assets (including font metrics if their inputs changed).",
    );
    failed = true;
  }
} else await writeFile(output, manifest);
if (failed) process.exitCode = 1;
else
  console.log(
    check
      ? "Assets match canonical sources."
      : "Synced shared and website assets.",
  );
