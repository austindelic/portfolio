// Deterministic rAF clock; no production hooks or altered quality settings.
async (page) => {
	const origin = page.url().split("/").slice(0, 3).join("/");
	const label = page.url().split("perfRun=")[1]?.split("&")[0] || "baseline";
	await page.addInitScript(() => {
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
	page.on("pageerror", (e) => errors.push(e.message));
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(origin + "/black-hole/", { waitUntil: "networkidle" });
	await page.getByTitle("Collapse Black Hole", { exact: true }).waitFor();
	for (const bloom of [0, 0.4, 0]) {
		await page.getByLabel("Bloom", { exact: true }).fill(String(bloom));
		await page.getByLabel("Bloom", { exact: true }).press("Tab");
		await page.waitForTimeout(100);
		await page.evaluate(() => window.__stepFrames(90));
		const style = await page.addStyleTag({
			content: "[data-black-hole-control] {visibility:hidden !important}",
		});
		await page.screenshot({
			path: ".playwright-cli/" + label + "-editor-bloom-" + bloom + ".png",
		});
		await style.evaluate((el) => el.remove());
	}
	return { label, errors };
}
