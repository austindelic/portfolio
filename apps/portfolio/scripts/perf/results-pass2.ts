import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
const out = resolve("apps/portfolio/performance/pass2");
await mkdir(out, { recursive: true });
const median = (a: number[]) =>
  [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
const logs = process.argv.slice(2);
for (const name of logs) {
  const log = await readFile(`/private/tmp/portfolio-${name}.log`, "utf8");
  if (!log.includes("### Result\n")) throw new Error(`Missing result: ${name}`);
  const data: {
    results: ({ viewport: { width: number }; port?: number } & Record<
      string,
      unknown
    >)[];
  } = JSON.parse(log.split("### Result\n")[1].split("\n### Ran")[0]);
  await writeFile(
    resolve(out, `${name}.json`),
    JSON.stringify(data, null, 2) + "\n",
  );
  if (data.results?.[0]?.port) {
    const summary = [];
    for (const width of [1440, 2560, 390])
      for (const port of [4400, 4401]) {
        const samples = data.results.filter(
          (r) => r.viewport.width === width && r.port === port,
        );
        if (!samples.length) continue;
        const row: Record<string, number> = {
          width,
          port,
          samples: samples.length,
        };
        for (const key of [
          "median",
          "p95",
          "cpuMedian",
          "cpuP95",
          "wallMedian",
          "wallP95",
          "firstFrame",
          "firstGpuCompletedFrame",
          "firstPresentationOpportunity",
          "compilationBlockingMs",
          "droppedFrames",
        ])
          if (samples.every((r) => typeof r[key] === "number"))
            row[key] = median(samples.map((r) => r[key] as number));
        summary.push(row);
      }
    await writeFile(
      resolve(out, `${name}-summary.json`),
      JSON.stringify(summary, null, 2) + "\n",
    );
    console.log(name, summary);
  }
}
// Compare two capture labels when provided in environment variables.
if (process.env.CAPTURE_BEFORE && process.env.CAPTURE_AFTER) {
  const before = process.env.CAPTURE_BEFORE,
    after = process.env.CAPTURE_AFTER,
    suffix = process.env.CAPTURE_AFTER_SUFFIX || "",
    comparisons = [];
  for (const file of (await readdir(".playwright-cli")).filter(
    (f) =>
      f.startsWith(before + "-") &&
      !(after !== before && f.startsWith(after + "-")) &&
      f.endsWith(".png") &&
      (!suffix || /-\d+\.png$/.test(f)),
  )) {
    const counterpart = after + file.slice(before.length, -4) + suffix + ".png";
    const a = await sharp(resolve(".playwright-cli", file))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const b = await sharp(resolve(".playwright-cli", counterpart))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (a.data.length !== b.data.length)
      throw new Error("Capture dimensions differ");
    let changedChannels = 0,
      maxDifference = 0,
      minX = a.info.width,
      minY = a.info.height,
      maxX = -1,
      maxY = -1;
    for (let i = 0; i < a.data.length; i++)
      if (a.data[i] !== b.data[i]) {
        changedChannels++;
        maxDifference = Math.max(
          maxDifference,
          Math.abs(a.data[i] - b.data[i]),
        );
        const pixel = Math.floor(i / 4),
          x = pixel % a.info.width,
          y = Math.floor(pixel / a.info.width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    comparisons.push({
      file,
      counterpart,
      changedChannels,
      maxDifference,
      bounds: changedChannels ? [minX, minY, maxX, maxY] : null,
    });
  }
  await writeFile(
    resolve(out, `${before}-vs-${after}${suffix}.json`),
    JSON.stringify(comparisons, null, 2) + "\n",
  );
  console.log(
    "Comparisons",
    comparisons.length,
    "non-identical",
    comparisons.filter((c) => c.changedChannels),
  );
}
