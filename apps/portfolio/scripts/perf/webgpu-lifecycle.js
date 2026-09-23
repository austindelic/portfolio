async (page) => {
	const origin = page.url().split("/").slice(0, 3).join("/");
	const browser = page.context().browser(),
		results = [];
	for (const c of browser.contexts()) if (c !== page.context()) await c.close();
	for (const scenario of [
		"normal",
		"missing-api",
		"missing-adapter",
		"device-failure",
		"pipeline-failure",
		"allocation-failure",
		"late-device-loss",
		"unmount-pending",
		"both-unavailable",
	]) {
		const context = await browser.newContext({
			viewport: { width: 800, height: 600 },
		});
		await context.addInitScript((scenario) => {
			window.__gpuAudit = {
				devices: 0,
				destroyed: 0,
				textures: 0,
				texturesDestroyed: 0,
				errors: [],
			};
			if (scenario === "missing-api")
				Object.defineProperty(navigator, "gpu", { value: undefined });
			if (scenario === "missing-adapter")
				navigator.gpu.requestAdapter = async () => null;
			if (scenario === "both-unavailable") {
				navigator.gpu.requestAdapter = async () => null;
				const original = HTMLCanvasElement.prototype.getContext;
				HTMLCanvasElement.prototype.getContext = function (type, ...args) {
					return type === "webgl2" ? null : original.call(this, type, ...args);
				};
			}
			if (typeof GPUAdapter !== "undefined") {
				const original = GPUAdapter.prototype.requestDevice;
				GPUAdapter.prototype.requestDevice = async function (...args) {
					if (scenario === "device-failure")
						throw Error("Injected device creation failure");
					const device = await original.apply(this, args);
					window.__gpuDevice = device;
					window.__gpuAudit.devices++;
					const destroy = device.destroy.bind(device);
					device.destroy = () => {
						window.__gpuAudit.destroyed++;
						destroy();
					};
					const texture = device.createTexture.bind(device);
					device.createTexture = (...args) => {
						if (scenario === "allocation-failure")
							throw Error("Injected texture allocation failure");
						const t = texture(...args);
						window.__gpuAudit.textures++;
						const destroy = t.destroy.bind(t);
						t.destroy = () => {
							window.__gpuAudit.texturesDestroyed++;
							destroy();
						};
						return t;
					};
					const pipeline = device.createRenderPipelineAsync.bind(device);
					device.createRenderPipelineAsync = async (...args) => {
						if (scenario === "pipeline-failure")
							throw Error("Injected shader pipeline failure");
						if (scenario === "unmount-pending")
							await new Promise((r) => setTimeout(r, 1000));
						return pipeline(...args);
					};
					return device;
				};
			}
		}, scenario);
		const p = await context.newPage();
		const errors = [],
			requests = [];
		p.on("pageerror", (e) => errors.push(e.message));
		p.on("console", (m) => {
			if (m.type() === "error") errors.push(m.text());
		});
		p.on("requestfailed", (r) => requests.push(r.url()));
		await p.route("**/_astro/BlackHoleBackground*.js", async (route) => {
			const response = await route.fetch();
			const prelude = `for(const host of document.querySelectorAll('[data-black-hole-background]'))host.dataset.settings=JSON.stringify({...JSON.parse(host.dataset.settings),backend:${JSON.stringify(scenario === "normal" ? "auto" : "webgpu")},debugStats:true});\n`;
			await route.fulfill({
				response,
				body: prelude + (await response.text()),
			});
		});
		await p.goto(origin + "/", { waitUntil: "domcontentloaded" });
		if (scenario === "both-unavailable")
			await p.waitForFunction(() =>
				document
					.querySelector("[data-black-hole-error]")
					?.textContent.includes("WebGL2"),
			);
		else if (scenario === "unmount-pending") {
			await p.waitForFunction(() => window.__gpuDevice);
			await p.evaluate(() => {
				const next = document.implementation.createHTMLDocument();
				document.dispatchEvent(
					Object.assign(new Event("astro:before-swap"), { newDocument: next }),
				);
			});
			await p.waitForTimeout(1300);
		} else
			await p.waitForFunction(() => window.__blackHoleStats?.frame > 2, null, {
				timeout: 60000,
			});
		const initial = await p.evaluate(() => ({
			stats: window.__blackHoleStats,
			audit: { ...window.__gpuAudit },
		}));
		let details = {};
		if (scenario === "late-device-loss") {
			await p.evaluate(() => {
				window.__previousCanvas = document.querySelector("canvas");
				window.__previousStats = window.__blackHoleStats;
				window.__gpuDevice.destroy();
			});
			await p.waitForFunction(
				() =>
					window.__blackHoleStats?.backend === "webgl2" &&
					window.__blackHoleStats.frame > 2,
			);
			details = await p.evaluate(() => ({
				freshCanvas:
					window.__previousCanvas !== document.querySelector("canvas"),
				before: window.__previousStats,
				after: window.__blackHoleStats,
			}));
		}
		if (scenario === "normal") {
			await p.evaluate(() => {
				window.__firstCanvas = document.querySelector("canvas");
				window.__firstDevice = window.__gpuDevice;
			});
			for (const path of [
				"/blog/",
				"/blog/production-systems-notes/",
				"/blog/building-tactify/",
				"/blog/still-and-desired-state/",
				"/socials/",
				"/",
			]) {
				await p.evaluate((path) => {
					const a = document.createElement("a");
					a.id = "gpu-navigation";
					a.href = path;
					a.textContent = "Navigate";
					a.style.cssText = "position:fixed;top:0;left:0;z-index:999999";
					document.body.append(a);
				}, path);
				await p.locator("#gpu-navigation").click();
				await p.waitForURL(origin + path);
				await p.waitForTimeout(150);
			}
			details = await p.evaluate(() => ({
				sameCanvas: window.__firstCanvas === document.querySelector("canvas"),
				sameDevice: window.__firstDevice === window.__gpuDevice,
			}));
			await p.setViewportSize({ width: 390, height: 844 });
			await p.waitForTimeout(350);
			const resized = await p.evaluate(() => window.__blackHoleStats);
			await p.evaluate(() => {
				Object.defineProperty(document, "hidden", {
					configurable: true,
					get: () => true,
				});
				document.dispatchEvent(new Event("visibilitychange"));
			});
			const hidden = await p.evaluate(() => window.__blackHoleStats?.frame);
			await p.waitForTimeout(300);
			const hiddenAgain = await p.evaluate(
				() => window.__blackHoleStats?.frame,
			);
			await p.evaluate(() => {
				delete document.hidden;
				document.dispatchEvent(new Event("visibilitychange"));
			});
			await p.waitForTimeout(350);
			const visibleAgain = await p.evaluate(
				() => window.__blackHoleStats?.frame,
			);
			await p.emulateMedia({ reducedMotion: "reduce" });
			await p.waitForTimeout(200);
			const paused = await p.evaluate(() => window.__blackHoleStats?.frame);
			await p.waitForTimeout(200);
			const pausedAgain = await p.evaluate(
				() => window.__blackHoleStats?.frame,
			);
			await p.emulateMedia({ reducedMotion: "no-preference" });
			await p.waitForTimeout(350);
			details = {
				...details,
				resized,
				hidden,
				hiddenAgain,
				visibleAgain,
				paused,
				pausedAgain,
				resumed: await p.evaluate(() => window.__blackHoleStats?.frame),
			};
		}
		await p.evaluate(() => {
			const next = document.implementation.createHTMLDocument();
			document.dispatchEvent(
				Object.assign(new Event("astro:before-swap"), { newDocument: next }),
			);
		});
		await p.waitForTimeout(100);
		results.push({
			scenario,
			initial,
			details,
			audit: await p.evaluate(() => window.__gpuAudit),
			errors,
			requests,
			errorText: await p.locator("[data-black-hole-error]").textContent(),
		});
		await context.close();
	}
	return results;
}
