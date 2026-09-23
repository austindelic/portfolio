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

	await page.addInitScript(() => {
		const names = new WeakMap(),
			get = WebGL2RenderingContext.prototype.getUniformLocation,
			set = WebGL2RenderingContext.prototype.uniform1f;
		WebGL2RenderingContext.prototype.getUniformLocation = function (p, n) {
			const l = get.call(this, p, n);
			if (l) names.set(l, n);
			return l;
		};
		WebGL2RenderingContext.prototype.uniform1f = function (l, v) {
			return set.call(this, l, names.get(l) === "iTime" ? 2 : v);
		};
	});
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	let settings = {};
	await page.route("**/black-hole/**", async (route) => {
		if (!route.request().isNavigationRequest()) {
			await route.continue();
			return;
		}
		const response = await route.fetch();
		const html = (await response.text()).replace(
			/ props="([^"]+)"/,
			(whole, encoded) => {
				const props = JSON.parse(
					encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&"),
				);
				for (const [key, value] of Object.entries(settings))
					props[key] = [0, value];
				return (
					' props="' +
					JSON.stringify(props)
						.replaceAll("&", "&amp;")
						.replaceAll('"', "&quot;") +
					'"'
				);
			},
		);
		await route.fulfill({ response, body: html });
	});
	await page.setViewportSize({ width: 1440, height: 900 });
	const scenarios = [
		["full", {}],
		["bloom", { bloomStrength: 0.4 }],
		["plain", { asciiEnabled: false }],
		["mixed", { asciiMix: 0.45 }],
		["mix-zero", { asciiMix: 0 }],
		[
			"palette",
			{ paletteMode: "custom", brightness: 0.1, contrast: 1.3, textSize: 13 },
		],
		["font", { fontFamily: "DSEG14Modern", textSize: 11 }],
		["glyphs", { fontFamily: "Menlo", glyphPreset: "dense", textSize: 7 }],
	];
	for (const [name, props] of scenarios) {
		settings = { ...props, animationMode: "off", animationAutoplay: false };
		await page.goto(origin + "/black-hole/?capture=" + name, {
			waitUntil: "domcontentloaded",
		});
		await page.getByTitle("Collapse Black Hole", { exact: true }).waitFor();
		await page.waitForFunction(() => window.__programsReady >= 3, null, {
			polling: 50,
		});
		await page.evaluate(() => {
			window.__stepFrames(120);
			const gl = document.querySelector("canvas").getContext("webgl2");
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
		});
		await page.addStyleTag({
			content: "[data-black-hole-control] {visibility:hidden !important}",
		});
		await page.waitForTimeout(100);
		await page.screenshot({
			path: ".playwright-cli/" + label + "-settings-" + name + ".png",
		});
	}
	return { label, errors, scenarios: scenarios.map(([name]) => name) };
}
