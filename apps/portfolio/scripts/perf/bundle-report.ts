import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import ts from "typescript";

// Run from repo root: bun apps/portfolio/scripts/perf/summarize.ts BASELINE_DIST FINAL_DIST LOG_DIR
const [baselineDist, finalDist] = process.argv.slice(2);
if (!baselineDist || !finalDist)
  throw new Error("Expected baseline and final dist directories");
const output = resolve("apps/portfolio/performance/pass2");
await mkdir(output, { recursive: true });
async function initialAssets(directory: string) {
  const html = await readFile(resolve(directory, "index.html"), "utf8");
  const pending = [
    ...html.matchAll(
      /(?:src|component-url|renderer-url)="(\/_astro\/[^"?]+\.js)"/g,
    ),
  ].map((m) => resolve(directory, `.${m[1]}`));
  const visited = new Set(),
    files: { name: string; bytes: number; gzip: number; brotli: number }[] = [];
  while (pending.length) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    visited.add(path);
    const code = await readFile(path, "utf8"),
      buffer = Buffer.from(code);
    files.push({
      name: path.slice(resolve(directory).length + 1),
      bytes: buffer.length,
      gzip: gzipSync(buffer).length,
      brotli: brotliCompressSync(buffer).length,
    });
    const parsed = ts.createSourceFile(
      path,
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    for (const node of parsed.statements)
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const name = node.moduleSpecifier.text;
        if (name.startsWith(".")) pending.push(resolve(dirname(path), name));
      }
  }
  return {
    files,
    ...Object.fromEntries(
      (["bytes", "gzip", "brotli"] as const).map((k) => [
        k,
        files.reduce((n, f) => n + f[k], 0),
      ]),
    ),
  };
}
const bundles = {
  baseline: await initialAssets(baselineDist),
  candidate: await initialAssets(finalDist),
};
await writeFile(
  resolve(output, "bundles.json"),
  JSON.stringify(bundles, null, 2) + "\n",
);
console.log(JSON.stringify(bundles, null, 2));
