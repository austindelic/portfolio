// Diagnostic estimates only: draw + synchronous readback includes driver cost.
async (page) => {
	const origin = page.url().split("/").slice(0, 3).join("/");
	await page.addInitScript(() => {
		const probe = (window.__passCompletion = {
			samples: [[], [], []],
			draws: 0,
		});
		const draw = WebGL2RenderingContext.prototype.drawArrays,
			pixel = new Uint8Array(4);
		WebGL2RenderingContext.prototype.drawArrays = function (...args) {
			const start = performance.now();
			const result = draw.apply(this, args);
			this.readPixels(0, 0, 1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel);
			const elapsed = performance.now() - start;
			if (probe.draws >= 120) probe.samples[probe.draws % 3].push(elapsed);
			probe.draws++;
			return result;
		};
	});
	const results = [];
	for (const viewport of [
		{ width: 1440, height: 900 },
		{ width: 2560, height: 1440 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(viewport);
		await page.goto(origin + "/", { waitUntil: "networkidle" });
		await page.waitForFunction(() => window.__passCompletion.draws >= 480, {
			timeout: 60000,
		});
		results.push(
			await page.evaluate(
				(viewport) => ({ viewport, ...window.__passCompletion }),
				viewport,
			),
		);
	}
	return results;
}
