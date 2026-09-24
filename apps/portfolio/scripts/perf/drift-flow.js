// Run intro-flow.js first in the same Playwright session to install its controlled clock.
async (page) => {
	const results = [];
	const views = [
		["/", 140],
		["/blog", 150],
		["/blog/site-and-terminal", 160],
		["/socials", 160],
		["/404", 150],
	];
	for (const [path, period] of views) {
		await page.goto(page.url().split("/").slice(0, 3).join("/") + path);
		await page.waitForFunction(() => window.queued?.() > 0, null, {
			polling: 100,
		});
		await page.evaluate(() => {
			for (let i = 0; i < 90; i++) window.step(100);
		});
		const first = await page.evaluate(() =>
			structuredClone(window.cameraUniforms.uCameraPosition),
		);
		let min = Infinity,
			max = 0;
		for (let quarter = 0; quarter < 4; quarter++) {
			for (let n = 0; n < period * 2.5; n += 25) {
				const count = Math.min(25, period * 2.5 - n);
				await page.evaluate((count) => {
					for (let i = 0; i < count; i++) window.step(100);
				}, count);
			}
			const position = await page.evaluate(
					() => window.cameraUniforms.uCameraPosition,
				),
				radius = Math.hypot(...position);
			min = Math.min(min, radius);
			max = Math.max(max, radius);
			await page.screenshot({
				path: `/tmp/loop-${path.replaceAll("/", "-")}-${quarter}.png`,
			});
		}
		const final = await page.evaluate(
			() => window.cameraUniforms.uCameraPosition,
		);
		const closure = Math.hypot(...final.map((v, i) => v - first[i]));
		if (closure > 0.0001) throw new Error(JSON.stringify({ path, closure }));
		results.push({ path, period, closure, minRadius: min, maxRadius: max });
	}
	return results;
}
