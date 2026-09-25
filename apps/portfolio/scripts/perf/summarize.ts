type Measurement = Awaited<ReturnType<typeof import("./measure.ts").default>>;
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import ts from "typescript";
import sharp from "sharp";

// Run from repo root: bun apps/portfolio/scripts/perf/summarize.ts BASELINE_DIST FINAL_DIST LOG_DIR
const [baselineDist, finalDist, logDir = "/private/tmp"] =
  process.argv.slice(2);
if (!baselineDist || !finalDist)
  throw new Error("Expected baseline and final dist directories");
const output = resolve("apps/portfolio/performance");
await mkdir(output, { recursive: true });
const median = (values: (number | null)[]) =>
  [...values].sort((a, b) => a! - b!)[Math.floor(values.length / 2)];
async function result<T = unknown>(name: string): Promise<T> {
  const text = await readFile(resolve(logDir, `portfolio-${name}.log`), "utf8");
  const start = text.indexOf("### Result\n");
  if (start < 0) throw new Error(`No successful result in ${name}`);
  return JSON.parse(
    text
      .slice(start + 11)
      .split("\n### Ran")[0]
      .trim(),
  );
}
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
    ...(Object.fromEntries(
      (["bytes", "gzip", "brotli"] as const).map((k) => [
        k,
        files.reduce((n, f) => n + f[k], 0),
      ]),
    ) as Record<"bytes" | "gzip" | "brotli", number>),
  };
}
const baseline = await result<Measurement>("baseline-measure"),
  final = await result<Measurement>("final-measure");
const summaries = [];
for (const width of [1440, 2560, 390]) {
  const select = (data: Measurement) =>
    data.results.filter(
      (r: { viewport: { width: number } }) => r.viewport.width === width,
    );
  const aggregate = (data: Measurement) =>
    Object.fromEntries(
      (
        [
          "cpuMedian",
          "cpuP95",
          "wallMedian",
          "wallP95",
          "firstFrame",
          "drawsPerFrame",
        ] as const
      ).map((k) => [k, median(select(data).map((r) => r[k]))]),
    );
  summaries.push({
    width,
    baseline: aggregate(baseline),
    final: aggregate(final),
    baselineResources: select(baseline)[0].resources,
    finalResources: select(final)[0].resources,
  });
}
const comparisons = [];
for (const name of [
  ...[1440, 2560, 390].flatMap((width) =>
    [30, 60, 120, 420].map((frame) => `${width}-${frame}.png`),
  ),
  "editor-bloom-0.png",
  "editor-bloom-0.4.png",
  ...["blog", "post", "socials", "home"].map((route) => `route-${route}.png`),
]) {
  const a = await sharp(`.playwright-cli/baseline-${name}`)
      .raw()
      .toBuffer({ resolveWithObject: true }),
    b = await sharp(`.playwright-cli/final-${name}`).raw().toBuffer();
  if (a.data.length !== b.length)
    throw new Error(`Image dimensions changed: ${name}`);
  let changedChannels = 0,
    maxDifference = 0;
  for (let i = 0; i < b.length; i++) {
    if (a.data[i] !== b[i]) changedChannels++;
    maxDifference = Math.max(maxDifference, Math.abs(a.data[i] - b[i]));
  }
  comparisons.push({
    name,
    width: a.info.width,
    height: a.info.height,
    changedChannels,
    maxDifference,
  });
}
const baselineAssets = await initialAssets(baselineDist),
  finalAssets = await initialAssets(finalDist);
const report = {
  environment: {
    userAgent: baseline.results[0].userAgent,
    gpu: baseline.results[0].gpu,
    dpr: baseline.results[0].dpr,
    mobile: "viewport emulation on the same desktop GPU",
  },
  summaries,
  assets: {
    baseline: baselineAssets,
    final: finalAssets,
    reductionPercent: Object.fromEntries(
      (["bytes", "gzip", "brotli"] as const).map((k) => [
        k,
        100 * (1 - finalAssets[k] / baselineAssets[k]),
      ]),
    ),
  },
  comparisons,
};
for (const [name, data] of [
  ["baseline", baseline],
  ["final", final],
  ["summary", report],
  ["flows", await result("flows")],
  ["optional", await result("optional")],
  ["audit", await result("audit")],
  ["baseline-capture", await result("baseline-capture")],
  ["final-capture", await result("final-capture")],
  ["failure-paths", await result("failures")],
  ["baseline-readback", await result("baseline-readback")],
  ["final-readback", await result("final-readback")],
  ["baseline-routes", await result("baseline-routes")],
  ["final-routes", await result("final-routes")],
])
  await writeFile(
    resolve(output, `${name}.json`),
    JSON.stringify(data, null, 2) + "\n",
  );
console.log(JSON.stringify(report, null, 2));
