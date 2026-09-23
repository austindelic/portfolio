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

	const checkpoints = [];
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
	await page.waitForSelector("canvas");
	await page.waitForFunction(() => window.__programsReady >= 3, null, {
		polling: 50,
	});
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
