import fs from "node:fs";
const raw = fs.readFileSync(process.argv[2], "utf8");
const report = JSON.parse(raw.split("### Result\n")[1].split("\n###")[0]);
const percentile = (v, p) => {
	const s = [...v].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? null;
};
const trials = report.results.map((r) => {
	const spacing = r.frames
		.slice(1)
		.map((f, i) => f.timestamp - r.frames[i].timestamp);
	return {
		viewport: r.viewport,
		repetition: r.repetition,
		backend: r.backend,
		activeBackend: r.stats?.backend,
		firstDrawMs: r.firstDrawMs,
		cpuMedianMs: percentile(
			r.frames.map((f) => f.cpu),
			0.5,
		),
		cpuP95Ms: percentile(
			r.frames.map((f) => f.cpu),
			0.95,
		),
		frameMedianMs: percentile(spacing, 0.5),
		frameP95Ms: percentile(spacing, 0.95),
		slowFrameFraction: spacing.filter((t) => t > 25).length / spacing.length,
		gpuLastSampleMs: r.stats?.gpuFrameTimeMs,
		textureMemoryBytes: r.stats?.estimatedTextureMemoryBytes,
		errors: r.errors,
	};
});
const summary = [];
for (const width of [1440, 2560, 390])
	for (const backend of ["webgl2", "webgpu"]) {
		const group = trials.filter(
			(r) => r.viewport.width === width && r.backend === backend,
		);
		const row = { width, backend, trials: group.length };
		for (const key of [
			"firstDrawMs",
			"cpuMedianMs",
			"cpuP95Ms",
			"frameMedianMs",
			"frameP95Ms",
			"slowFrameFraction",
			"gpuLastSampleMs",
			"textureMemoryBytes",
		])
			row[key] = percentile(
				group.map((r) => r[key]).filter((v) => v !== null),
				0.5,
			);
		summary.push(row);
	}
fs.writeFileSync(
	"apps/portfolio/performance/webgpu/measurements.json",
	JSON.stringify(report, null, 2) + "\n",
);
fs.writeFileSync(
	"apps/portfolio/performance/webgpu/performance.json",
	JSON.stringify({ browser: report.browser, summary, trials }, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
if (trials.some((t) => t.activeBackend !== t.backend || t.errors.length))
	process.exitCode = 1;
