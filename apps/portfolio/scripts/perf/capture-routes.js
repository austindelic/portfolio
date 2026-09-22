// Deterministic rAF clock; no production hooks or altered quality settings.
async (page) => {
	const origin = page.url().split("/").slice(0, 3).join("/");
	const label = page.url().split("perfRun=")[1]?.split("&")[0] || "baseline";
	await page.addInitScript(() => {
		window.__routeProbe = { programs: 0, uniforms: {} };
		const names = new WeakMap(),
			loc = WebGL2RenderingContext.prototype.getUniformLocation,
			create = WebGL2RenderingContext.prototype.createProgram;
		WebGL2RenderingContext.prototype.createProgram = function () {
			window.__routeProbe.programs++;
			return create.call(this);
		};
		WebGL2RenderingContext.prototype.getUniformLocation = function (p, n) {
			const l = loc.call(this, p, n);
			if (l) names.set(l, n);
			return l;
		};
		for (const name of ["uniform1f", "uniform1i", "uniform3fv"]) {
			const original = WebGL2RenderingContext.prototype[name];
			WebGL2RenderingContext.prototype[name] = function (l, v) {
				window.__routeProbe.uniforms[names.get(l)] =
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

	const checkpoints = [];
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(origin + "/", { waitUntil: "networkidle" });
	await page.waitForSelector("canvas");
	await page.evaluate(() => window.__stepFrames(420));
	for (const [selector, route] of [
		["#blog", "blog"],
		['a[href="/blog/building-tactify/"]', "post"],
		["#socials", "socials"],
		["#home", "home"],
	]) {
		await page.locator(selector).first().click();
		await page.waitForTimeout(500);
		await page.evaluate(() => window.__stepFrames(120));
		checkpoints.push({
			route,
			...(await page.evaluate(() => window.__routeProbe)),
		});
		await page.screenshot({
			path: ".playwright-cli/" + label + "-route-" + route + ".png",
		});
		await page.locator("canvas").screenshot({
			path: ".playwright-cli/" + label + "-route-" + route + "-canvas.png",
		});
	}
	return { label, errors, checkpoints };
}
