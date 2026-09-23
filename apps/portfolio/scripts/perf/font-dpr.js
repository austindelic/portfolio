async (page) => {
	const origin = page.url().split("/").slice(0, 3).join("/");
	await page.addInitScript(() => {
		window.__fontProbe = { contexts: 0, draws: 0, loads: [] };
		const probe = window.__fontProbe;
		const get = HTMLCanvasElement.prototype.getContext;
		const seen = new WeakSet();
		HTMLCanvasElement.prototype.getContext = function (...args) {
			const gl = get.apply(this, args);
			if (args[0] === "webgl2" && gl && !seen.has(gl)) {
				seen.add(gl);
				probe.contexts++;
			}
			return gl;
		};
		const draw = WebGL2RenderingContext.prototype.drawArrays;
		WebGL2RenderingContext.prototype.drawArrays = function (...args) {
			probe.draws++;
			return draw.apply(this, args);
		};
		const load = document.fonts.load.bind(document.fonts);
		document.fonts.check = () => false;
		document.fonts.load = (...args) =>
			new Promise((resolve, reject) =>
				probe.loads.push(() => load(...args).then(resolve, reject)),
			);
	});
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(origin + "/", { waitUntil: "networkidle" });
	await page.waitForFunction(() => window.__fontProbe.loads.length > 0);
	const pending = await page.evaluate(() => ({
		contexts: window.__fontProbe.contexts,
		draws: window.__fontProbe.draws,
	}));
	await page.evaluate(() => {
		const link = document.createElement("a");
		link.href = "/black-hole/";
		link.id = "font-navigation";
		link.textContent = "Editor";
		document.body.append(link);
	});
	await page.locator("#font-navigation").click();
	await page.waitForFunction(
		() =>
			location.pathname === "/black-hole/" &&
			window.__fontProbe.loads.length >= 2,
	);
	await page.evaluate(() =>
		window.__fontProbe.loads.forEach((release) => release()),
	);
	await page.waitForFunction(() => window.__fontProbe.draws > 3);
	const released = await page.evaluate(() => ({
		contexts: window.__fontProbe.contexts,
		draws: window.__fontProbe.draws,
	}));
	const client = await page.context().newCDPSession(page);
	const sizes = [];
	for (const dpr of [0.5, 1, 2, 1]) {
		await client.send("Emulation.setDeviceMetricsOverride", {
			width: 900,
			height: 700,
			deviceScaleFactor: dpr,
			mobile: false,
		});
		await page.waitForTimeout(250);
		sizes.push(
			await page.evaluate(() => ({
				dpr: devicePixelRatio,
				width: document.querySelector("canvas").width,
				height: document.querySelector("canvas").height,
				contexts: window.__fontProbe.contexts,
			})),
		);
	}
	await client.send("Emulation.clearDeviceMetricsOverride");
	await client.detach();
	const failures = [];
	if (pending.contexts !== 0 || pending.draws !== 0)
		failures.push("Renderer started before requested font was ready");
	if (released.contexts !== 1)
		failures.push(
			"Disposed public runtime mounted after delayed font completion",
		);
	if (!(sizes[0].width < sizes[1].width))
		failures.push("DPR increase did not resize render target");
	if (sizes[1].width !== sizes[3].width)
		failures.push("DPR round trip changed dimensions");
	if (sizes.some((s) => s.contexts !== 1))
		failures.push("DPR changes recreated context");
	return { pending, released, sizes, failures, errors };
}
