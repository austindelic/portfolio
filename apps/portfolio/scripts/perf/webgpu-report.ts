import fs from "node:fs";
import sharp from "sharp";
const raw = fs.readFileSync(process.argv[2], "utf8");
const report: Awaited<ReturnType<typeof import("./webgpu-parity.ts").default>> =
  JSON.parse(raw.split("### Result\n")[1].split("\n###")[0]);
const results = [];
for (const a of report.results.filter(
  (x: { backend: string }) => x.backend === "webgl2",
)) {
  const b = report.results.find(
    (x) =>
      x.backend === "webgpu" &&
      x.scenario === a.scenario &&
      x.width === a.width &&
      x.dpr === a.dpr &&
      x.target === a.target,
  );
  if (!b) throw Error("missing pair");
  const aa = await sharp(a.filename)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bb = await sharp(b.filename).removeAlpha().raw().toBuffer();
  let sum = 0,
    max = 0,
    changed = 0,
    over2 = 0,
    square = 0;
  const diff = Buffer.alloc(bb.length);
  for (let i = 0; i < bb.length; i++) {
    const d = Math.abs(aa.data[i] - bb[i]);
    sum += d;
    square += d * d;
    max = Math.max(d, max);
    changed += Number(d > 0);
    over2 += Number(d > 2);
    diff[i] = Math.min(255, d * 8);
  }
  const filename = a.filename.replace("webgl2", "difference");
  await sharp(diff, { raw: aa.info }).png().toFile(filename);
  results.push({
    scenario: a.scenario,
    width: a.width,
    dpr: a.dpr,
    target: a.target,
    meanAbsoluteError: sum / bb.length,
    maxChannelDifference: max,
    changedFraction: changed / bb.length,
    over2Fraction: over2 / bb.length,
    psnr: square ? 10 * Math.log10((255 * 255) / (square / bb.length)) : null,
    glFrame: a.stats?.frame,
    gpuFrame: b.stats?.frame,
    glTime: a.stats?.shaderTime,
    gpuTime: b.stats?.shaderTime,
    activeBackend: b.stats?.backend,
    difference: filename,
  });
}
fs.writeFileSync(
  "apps/portfolio/performance/webgpu/parity.json",
  JSON.stringify({ errors: report.errors, results }, null, 2) + "\n",
);
fs.writeFileSync(
  "apps/portfolio/performance/webgpu/parity-raw.json",
  JSON.stringify(report, null, 2) + "\n",
);
const failed = results.filter(
  (r) =>
    r.activeBackend !== "webgpu" ||
    r.glTime !== r.gpuTime ||
    r.glFrame !== r.gpuFrame ||
    r.meanAbsoluteError > 0.2 ||
    r.over2Fraction > 0.001,
);
console.log(
  JSON.stringify(
    {
      errors: report.errors,
      pairs: results.length,
      failed,
      worst: [...results]
        .sort((a, b) => b.meanAbsoluteError - a.meanAbsoluteError)
        .slice(0, 10),
    },
    null,
    2,
  ),
);

if (report.errors.length || failed.length) process.exitCode = 1;
