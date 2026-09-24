// Run with playwright-cli run-code --filename=... against a local portfolio preview.
async (page) => {
	const failures = [];
	const assert = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	page.on("pageerror", (error) => failures.push(error.message));
	page.on("requestfailed", (request) => failures.push(request.url()));
	page.on("console", (message) => {
		if (message.type() === "error") failures.push(message.text());
	});
	const origin = page.url().split("/").slice(0, 3).join("/");
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.goto(origin);
	await page.waitForFunction(
		() => window.__blackHoleAnimationSnapshot?.shaderTime > 10,
	);
	await page.evaluate(() => {
		window.orbitTestCanvas = document.querySelector("canvas");
	});
	const snapshot = () =>
		page.evaluate(() => ({
			...window.__blackHoleAnimationSnapshot,
			sameCanvas: window.orbitTestCanvas === document.querySelector("canvas"),
		}));
	let previous = await snapshot();
	const navigate = async (path, delay = 8200) => {
		await page.evaluate((path) => {
			const link = document.createElement("a");
			link.href = path;
			document.body.append(link);
			link.click();
			link.remove();
		}, path);
		await page.waitForURL((url) => url.pathname === path);
		await page.waitForTimeout(delay);
		const current = await snapshot();
		assert(current.sameCanvas, `Canvas replaced on ${path}`);
		assert(
			current.shaderTime >= previous.shaderTime,
			`Shader clock reset on ${path}`,
		);
		assert(
			current.cameraPosition.every(Number.isFinite),
			`Invalid camera on ${path}`,
		);
		if (delay >= 8000) {
			const anchors = {
				"/": [8.613, 3.1586, 21.229],
				"/blog": [3.45, 3.45, 4.6],
				"/blog/site-and-terminal": [4.4, 0.44, 2.2],
				"/socials": [1.155, 0.105, 0.63],
				"/404": [-1.1, -0.22, 1.1],
			};
			const viewport = page.viewportSize();
			const scale = 1;
			assert(
				Math.hypot(
					...current.cameraPosition.map((v, i) => v - anchors[path][i] * scale),
				) < 0.5,
				`Wrong composition on ${path}`,
			);
			await page.screenshot({
				path: `/tmp/restrained-${path.replaceAll("/", "-") || "home"}-${viewport.width}.png`,
			});
		}
		previous = current;
	};
	for (const path of [
		"/blog",
		"/blog/site-and-terminal",
		"/socials",
		"/404",
		"/",
	])
		await navigate(path);
	await page.goBack();
	await page.waitForTimeout(600);
	assert((await snapshot()).sameCanvas, "Back replaced canvas");
	await page.goForward();
	await page.waitForTimeout(600);
	assert((await snapshot()).sameCanvas, "Forward replaced canvas");
	for (const path of ["/blog", "/socials", "/"]) await navigate(path, 180);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForTimeout(3500);
	assert(
		(await snapshot()).shaderTime >= previous.shaderTime,
		"Resize reset clock",
	);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.waitForTimeout(700);
	const reduced = await snapshot();
	await page.waitForTimeout(700);
	assert(
		JSON.stringify(reduced) === JSON.stringify(await snapshot()),
		"Reduced motion is not static",
	);
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.waitForTimeout(700);
	assert(
		(await snapshot()).shaderTime > reduced.shaderTime,
		"Motion did not resume",
	);
	// Deterministic visibility lifecycle check; headless tabs do not reliably become hidden.
	await page.evaluate(() => {
		Object.defineProperty(document, "hidden", {
			configurable: true,
			get: () => true,
		});
		document.dispatchEvent(new Event("visibilitychange"));
	});
	try {
		const hidden = await snapshot();
		await page.waitForTimeout(700);
		assert(
			JSON.stringify(hidden) === JSON.stringify(await snapshot()),
			"Hidden page kept animating",
		);
	} finally {
		await page.evaluate(() => {
			delete document.hidden;
			document.dispatchEvent(new Event("visibilitychange"));
		});
	}
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.waitForTimeout(4000);
	const timing = await page.evaluate(
		() =>
			new Promise((resolve) => {
				const times = [];
				let last = performance.now();
				const start = last;
				function tick(now) {
					times.push(now - last);
					last = now;
					if (now - start < 5000) requestAnimationFrame(tick);
					else {
						times.sort((a, b) => a - b);
						resolve({
							frames: times.length,
							median: times[Math.floor(times.length * 0.5)],
							p95: times[Math.floor(times.length * 0.95)],
							max: times.at(-1),
						});
					}
				}
				requestAnimationFrame(tick);
			}),
	);
	assert(failures.length === 0, failures.join("\n"));
	return { passed: true, timing, failures };
}
