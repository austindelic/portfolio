async (page) => {
	const origin = page.url().split("/").slice(0, 3).join("/"),
		results = [],
		errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	const client = await page.context().newCDPSession(page);
	await client.send("LayerTree.enable");
	let layers = [];
	client.on("LayerTree.layerTreeDidChange", (event) => {
		layers = event.layers || [];
	});
	for (const path of [
		"/",
		"/blog/",
		"/blog/building-tactify/",
		"/blog/production-systems-notes/",
		"/blog/still-and-desired-state/",
		"/socials/",
		"/404.html",
		"/black-hole/",
	]) {
		await page.goto(origin + path, { waitUntil: "networkidle" });
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(100);
		results.push({
			path,
			layers: layers.length,
			drawingLayers: layers.filter((l) => l.drawsContent).length,
			...(await page.evaluate(() => ({
				title: document.title,
				fonts: document.fonts.status,
				fontReady: document.fonts.check('12px "Departure Mono"'),
				images: Array.from(document.images, (i) => ({
					src: i.getAttribute("src"),
					loaded: i.complete && i.naturalWidth > 0,
					loading: i.loading,
					width: i.width,
					height: i.height,
				})),
				islands: Array.from(document.querySelectorAll("astro-island"), (i) => ({
					component: i.getAttribute("component-url"),
					pending: i.hasAttribute("ssr"),
				})),
				resources: performance
					.getEntriesByType("resource")
					.map((r) => ({
						url: r.name,
						status: r.responseStatus,
						type: r.initiatorType,
					})),
			}))),
		});
	}
	await client.detach();
	const failures = results.filter(
		(r) =>
			!r.fontReady ||
			r.images.some((i) => !i.loaded) ||
			r.islands.some((i) => i.pending) ||
			r.resources.some((r) => r.status >= 400),
	);
	return { results, errors, failures };
}
