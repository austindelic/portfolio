// Deterministic rAF clock; no production hooks or altered quality settings.
async (page) => {
	const origin = page.url().split("/").slice(0, 3).join("/");
	const label = page.url().split("perfRun=")[1]?.split("&")[0] || "baseline";
	await page.addInitScript(() => {
		window.__programsReady = 0;
		const readyLocation = WebGL2RenderingContext.prototype.getUniformLocation;
		WebGL2RenderingContext.prototype.getUniformLocation = function (
			program,
			name,
		) {
			const result = readyLocation.call(this, program, name);
			if (name === "uBloomStrength") window.__programsReady++;
			return result;
		};

		window.__realNow = performance.now.bind(performance);
		window.__draws = 0;
		const draw = WebGL2RenderingContext.prototype.drawArrays;
		WebGL2RenderingContext.prototype.drawArrays = function (...args) {
			window.__draws++;
			return draw.apply(this, args);
		};
		let now = 1000,
			id = 0;
		const callbacks = new Map();
		window.requestAnimationFrame = (cb) => {
			callbacks.set(++id, cb);
			return id;
		};
		window.cancelAnimationFrame = (id) => callbacks.delete(id);
		performance.now = () => now;
		window.__stepFrames = (count) => {
			for (let i = 0; i < count; i++) {
				now += 1000 / 60;
				const queued = [...callbacks.values()];
				callbacks.clear();
				for (const callback of queued) callback(now);
			}
		};
		const NativeDate = Date;
		window.Date = class extends NativeDate {
			constructor(...args) {
				super(...(args.length ? args : ["2026-09-22T12:00:00Z"]));
			}
			static now() {
				return 1790078400000;
			}
		};
	});
	// Block client entrypoints until web fonts are loaded, on both builds.
	await page.route("**/_astro/*.js", async (route) => {
		const response = await route.fetch();
		// Load fonts inside the module: evaluating the navigating document from
		// a paused module request can deadlock document readiness.
		const prelude = `await (globalThis.__captureFonts ??= Promise.all([
          ["Departure Mono", "/fonts/DepartureMono-Regular.woff2"],
          ["DSEG14Modern", "/fonts/DSEG14Modern-Regular.woff2"]
        ].map(async ([family, url]) => {
          const font = await new FontFace(family, "url(" + url + ")").load();
          document.fonts.add(font);
        })));\n`;
		await route.fulfill({ response, body: prelude + (await response.text()) });
	});

	const results = [];
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 2560, height: 1440 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(viewport);
		for (let run = 0; run < 5; run++) {
			await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
			await page.waitForSelector("canvas");
			await page.waitForFunction(() => window.__programsReady >= 3, null, {
				polling: 50,
			});
			results.push(
				await page.evaluate(
					({ viewport, run }) => {
						const gl = document.querySelector("canvas").getContext("webgl2");
						window.__stepFrames(120);
						gl.finish();
						const pixel = new Uint8Array(4),
							before = window.__draws;
						const samples = [];
						for (let frame = 0; frame < 120; frame++) {
							const start = window.__realNow();
							window.__stepFrames(1);
							gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
							samples.push(window.__realNow() - start);
						}
						samples.sort((a, b) => a - b);
						if (window.__draws <= before)
							throw new Error("No shader frames measured");
						return {
							viewport,
							run,
							draws: window.__draws - before,
							median: samples[60],
							p95: samples[114],
							mean: samples.reduce((a, b) => a + b, 0) / samples.length,
							method:
								"synchronous frame plus 1-pixel readback, includes driver overhead",
						};
					},
					{ viewport, run },
				),
			);
		}
	}
	return { label, results };
}
