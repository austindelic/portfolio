// Production A/B measurements. Uses a fixed scene so both backends do identical work.
async (page) => {
	const origin = page.url().split("/").slice(0, 3).join("/"),
		browser = page.context().browser();
	const profiling = page.url().includes("profile=1");
	for (const context of browser.contexts())
		if (context !== page.context()) await context.close();
	const results = [];
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 2560, height: 1440 },
		{ width: 390, height: 844 },
	]) {
		for (let repetition = 0; repetition < 5; repetition++)
			for (const backend of repetition % 2
				? ["webgpu", "webgl2"]
				: ["webgl2", "webgpu"]) {
				const context = await browser.newContext({ viewport });
				await context.addInitScript(() => {
					const audit = (window.__measure = {
						frames: [],
						version: 0,
						firstDraw: null,
						resources: { textures: 0, buffers: 0 },
					});
					const glDraw = WebGL2RenderingContext.prototype.drawArrays;
					WebGL2RenderingContext.prototype.drawArrays = function (...args) {
						audit.activeBackend = "webgl2";
						audit.version++;
						audit.firstDraw ??= performance.now();
						return glDraw.apply(this, args);
					};
					if (typeof GPUAdapter !== "undefined") {
						const request = GPUAdapter.prototype.requestDevice;
						GPUAdapter.prototype.requestDevice = async function (...args) {
							const device = await request.apply(this, args);
							window.__gpuDevice = device;
							const submit = device.queue.submit.bind(device.queue);
							device.queue.submit = (...args) => {
								audit.activeBackend = "webgpu";
								audit.version++;
								audit.firstDraw ??= performance.now();
								return submit(...args);
							};
							return device;
						};
					}
					const raf = window.requestAnimationFrame;
					window.requestAnimationFrame = (cb) =>
						raf((timestamp) => {
							const before = audit.version,
								start = performance.now();
							cb(timestamp);
							const cpu = performance.now() - start;
							if (audit.version > before) audit.frames.push({ timestamp, cpu });
						});
				});
				const p = await context.newPage();
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.route("**/_astro/BlackHoleBackground*.js", async (route) => {
					const response = await route.fetch();
					const props = {
						backend,
						debugStats: profiling,
						animationMode: "off",
						timeScale: 0,
						initialCameraPosition: [11.256, 2.652, 18.44],
						initialCameraForward: [-0.5171, -0.1219, -0.8472],
					};
					await route.fulfill({
						response,
						body:
							`for(const host of document.querySelectorAll('[data-black-hole-background]'))host.dataset.settings=JSON.stringify({...JSON.parse(host.dataset.settings),...${JSON.stringify(props)}});\n` +
							(await response.text()),
					});
				});
				await p.goto(origin + "/", { waitUntil: "domcontentloaded" });
				await p.waitForFunction(
					() => window.__measure.frames.length >= 120,
					null,
					{ timeout: 60000 },
				);
				await p.evaluate(() => (window.__measure.frames = []));
				await p.waitForTimeout(2500);
				results.push({
					viewport,
					repetition,
					backend,
					errors,
					...(await p.evaluate(() => ({
						frames: window.__measure.frames,
						firstDrawMs: window.__measure.firstDraw,
						stats: window.__blackHoleStats ?? {
							backend: window.__measure.activeBackend,
							gpuFrameTimeMs: null,
							estimatedTextureMemoryBytes: null,
						},
						resolvedProps: JSON.parse(
							document.querySelector("[data-black-hole-background]").dataset
								.settings,
						),
						canvas: {
							width: document.querySelector("canvas").width,
							height: document.querySelector("canvas").height,
						},
					}))),
				});
				await context.close();
			}
	}
	return { browser: browser.version(), profiling, results };
}
