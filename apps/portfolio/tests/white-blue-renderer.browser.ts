// Run against a production preview with tooling/prepare-browser.ts and Playwright CLI.
export default async function testWhiteBlueRenderer(
	page: import("@playwright/test").Page,
) {
	const origin = page.url().split("/").slice(0, 3).join("/");
	await page.setViewportSize({ width: 1200, height: 1200 });
	await page.goto(`${origin}/?bhDebug`);
	await page.waitForFunction(() => (window.__blackHoleStats?.frame ?? 0) > 5);
	const moduleUrl = await page.evaluate(() =>
		performance
			.getEntriesByType("resource")
			.map((entry) => entry.name)
			.find((name) => /\/_astro\/index\.[^/]+\.js$/.test(name)),
	);
	if (!moduleUrl) throw Error("Renderer module was not loaded");
	// Release the portfolio's GPU session while the isolated renderer is checked.
	await page.setViewportSize({ width: 600, height: 600 });
	const fixture = await page.context().newPage();
	await fixture.setViewportSize({ width: 1200, height: 1200 });
	const errors: string[] = [];
	fixture.on("pageerror", (error) => errors.push(String(error)));
	fixture.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	fixture.on("requestfailed", (request) => errors.push(request.url()));
	await fixture.route("**/appearance-fixture", (route) =>
		route.fulfill({
			contentType: "text/html",
			body: '<html><head><link rel="icon" href="data:,"></head><body style="margin:0;background:white"><canvas id="scene" style="width:1200px;height:1200px"></canvas></body></html>',
		}),
	);
	const results: unknown[] = [];
	try {
		for (const backend of ["webgl2", "webgpu"] as const) {
			for (const variant of [
				"ascii",
				"continuous",
				"cell",
				"source",
				"bloom-zero",
			] as const) {
				await fixture.goto(`${origin}/appearance-fixture`);
				await fixture.evaluate(
					async ({ moduleUrl, backend, variant }) => {
						const exports = await import(/* @vite-ignore */ moduleUrl);
						const module = Object.values(exports).find(
							(value) =>
								typeof (value as { mountBlackHole?: unknown })
									?.mountBlackHole === "function",
						) as typeof import("@austindelic/blackhole");
						if (!module) throw Error("No mountBlackHole export");
						const canvas = document.querySelector<HTMLCanvasElement>("#scene");
						if (!canvas) throw Error("Scene canvas missing");
						const renderer = module.mountBlackHole(canvas, {
							backend,
							rendererMode: variant === "cell" ? "ascii-cell" : "fallback-full",
							appearance: variant === "source" ? undefined : "white-blue",
							paletteMode: variant === "source" ? "source" : "custom",
							shadowColor: "#2B1FD4",
							midColor: "#5478E8",
							highlightColor: "#C5D5FF",
							animationMode: "off",
							asciiEnabled: variant !== "continuous",
							asciiMix: 1,
							quality: "cinematic-ascii",
							maxDevicePixelRatio: 1,
							resolutionScale: 1,
							forceActiveRender: true,
							debugStats: true,
							textSize: 9,
							glyphPreset: "gargantua",
							customGlyphs: "voidCG08AA",
							timeScale: 0,
							temporalJitter: 0,
							exposure: 2,
							bloomStrength: variant === "bloom-zero" ? 0 : 0.65,
							initialCameraPosition: [11.256, 2.652, 18.44],
							initialCameraForward: [-0.5655, -0.0771, -0.8211],
							onError: (message) => {
								if (message) throw Error(message);
							},
						});
						(
							window as unknown as { __appearanceRenderer: typeof renderer }
						).__appearanceRenderer = renderer;
						if (!(await renderer.ready))
							throw Error("Renderer did not become ready");
					},
					{ moduleUrl, backend, variant },
				);
				await fixture.waitForFunction(() => {
					const renderer = (
						window as unknown as {
							__appearanceRenderer: ReturnType<
								typeof import("@austindelic/blackhole").mountBlackHole
							>;
						}
					).__appearanceRenderer;
					return (renderer.getStats()?.frame ?? 0) >= 20;
				});
				const result = await fixture.evaluate(
					({ backend, variant }) => {
						const renderer = (
							window as unknown as {
								__appearanceRenderer: ReturnType<
									typeof import("@austindelic/blackhole").mountBlackHole
								>;
							}
						).__appearanceRenderer;
						renderer.pause();
						const stats = renderer.getStats();
						if (!stats) throw Error("Renderer statistics missing");
						if (stats.backend !== backend)
							throw Error(
								`Expected ${backend}, got ${stats.backend}: ${stats.fallbackReason}`,
							);
						return { backend, variant, frame: stats.frame };
					},
					{ backend, variant },
				);
				await fixture.screenshot({
					path: `.playwright-cli/white-blue-${backend}-${variant}.png`,
					scale: "css",
				});
				results.push(result);
				await fixture.evaluate(() =>
					(
						window as unknown as {
							__appearanceRenderer: ReturnType<
								typeof import("@austindelic/blackhole").mountBlackHole
							>;
						}
					).__appearanceRenderer.dispose(),
				);
			}
		}
		if (errors.length) throw Error(JSON.stringify(errors));
		return results;
	} finally {
		await fixture.close();
	}
}
