// Deterministic rAF clock; no production hooks or altered quality settings.
async (page) => {
	const origin = page.url().split("/").slice(0, 3).join("/");
	const label = page.url().split("perfRun=")[1]?.split("&")[0] || "baseline";
	await page.addInitScript(() => {
		window.__captureUniforms = {};
		const names = new WeakMap(),
			loc = WebGL2RenderingContext.prototype.getUniformLocation;
		WebGL2RenderingContext.prototype.getUniformLocation = function (p, n) {
			const l = loc.call(this, p, n);
			if (l) names.set(l, n);
			return l;
		};
		for (const name of ["uniform1f", "uniform1i", "uniform3fv"]) {
			const original = WebGL2RenderingContext.prototype[name];
			WebGL2RenderingContext.prototype[name] = function (l, v) {
				window.__captureUniforms[names.get(l)] =
					typeof v === "number" ? v : Array.from(v);
				return original.call(this, l, v);
			};
		}

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
		await page.evaluate(async () => {
			await document.fonts.load('12px "Departure Mono"');
			await document.fonts.load('12px "DSEG14Modern"');
			await document.fonts.ready;
		});
		await route.continue();
	});
	const errors = [],
		checkpoints = [];
	page.on("pageerror", (e) => errors.push(e.message));
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 2560, height: 1440 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(viewport);
		await page.goto(origin + "/", { waitUntil: "networkidle" });
		await page.waitForSelector("canvas");
		let previousFrame = 0;
		for (const target of [30, 60, 120, 420]) {
			await page.evaluate(
				(n) => window.__stepFrames(n),
				target - previousFrame,
			);
			previousFrame = target;
			// The compositor can lag GPU submission after a synthetic RAF burst.
			// Complete GPU work and allow presentation without advancing shader time.
			await page.evaluate(() => {
				const gl = document.querySelector("canvas").getContext("webgl2");
				gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
			});
			await page.waitForTimeout(100);

			checkpoints.push({
				viewport,
				target,
				uniforms: await page.evaluate(() => window.__captureUniforms),
			});
			await page.screenshot({
				path:
					".playwright-cli/" +
					label +
					"-" +
					viewport.width +
					"-" +
					target +
					".png",
			});
			await page.locator("canvas").screenshot({
				path:
					".playwright-cli/" +
					label +
					"-" +
					viewport.width +
					"-" +
					target +
					"-canvas.png",
			});
		}
	}
	return { label, errors, checkpoints };
}
