export default async function testWhiteBlueTheme(
	page: import("@playwright/test").Page,
) {
	const origin = page.url().split("/").slice(0, 3).join("/");
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(String(error)));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("requestfailed", (request) => errors.push(request.url()));
	const states: unknown[] = [];
	const checkTheme = async () => {
		await page.waitForFunction(
			() => !document.documentElement.hasAttribute("data-astro-transition"),
		);
		const state = await page.evaluate(() => {
			const body = getComputedStyle(document.body);
			const theme = getComputedStyle(document.documentElement);
			const heading = document.querySelector("h1")?.textContent;
			const contrast = (foreground: string, background: string) => {
				const luminance = (colour: string) => {
					const channels = (colour.match(/\d+/g) ?? [])
						.slice(0, 3)
						.map(Number)
						.map((value) => {
							const channel = value / 255;
							return channel <= 0.04045
								? channel / 12.92
								: ((channel + 0.055) / 1.055) ** 2.4;
						});
					return (
						channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
					);
				};
				const values = [luminance(foreground), luminance(background)].sort(
					(a, b) => b - a,
				);
				return (values[0] + 0.05) / (values[1] + 0.05);
			};
			const caption = document.querySelector(".clock-caption");
			const navigation =
				document.querySelector('.nav-link[aria-current="page"]') ??
				document.querySelector(".nav-link");
			if (!caption || !navigation) throw Error("Header missing");
			const muted = getComputedStyle(caption).color;
			const nav = getComputedStyle(navigation);
			const codeBlock = document.querySelector("pre");
			const result = {
				path: location.pathname,
				heading,
				background: body.backgroundColor,
				colour: body.color,
				scheme: theme.colorScheme,
				overflow: document.documentElement.scrollWidth > innerWidth,
				textContrast: contrast(body.color, "rgb(255, 255, 255)"),
				mutedContrast: contrast(muted, "rgb(255, 255, 255)"),
				navBackground: nav.backgroundColor,
				navColour: nav.color,
				codeBackground: codeBlock
					? getComputedStyle(codeBlock).backgroundColor
					: null,
			};
			if (
				result.background !== "rgb(255, 255, 255)" ||
				result.colour !== "rgb(16, 36, 91)" ||
				result.scheme !== "light" ||
				result.overflow ||
				result.textContrast < 4.5 ||
				result.mutedContrast < 4.5
			)
				throw Error(JSON.stringify(result));
			if (
				document.querySelector('.nav-link[aria-current="page"]') &&
				(result.navBackground !== "rgb(43, 31, 212)" ||
					result.navColour !== "rgb(255, 255, 255)")
			)
				throw Error("Active navigation lost contrast");
			if (
				result.codeBackground &&
				result.codeBackground !== "rgb(234, 240, 255)"
			)
				throw Error("Code surface is not light blue");
			return result;
		});
		states.push(state);
	};
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto(`${origin}/?bhDebug`);
	await page.waitForFunction(() => (window.__blackHoleStats?.frame ?? 0) > 5);
	await checkTheme();
	await page.evaluate(() => {
		(window as unknown as { __themeCanvas: Element | null }).__themeCanvas =
			document.querySelector(".bh-background-live");
	});
	for (const path of [
		"/blog",
		"/blog/contracts-in-rust-and-cpp",
		"/socials",
		"/",
	]) {
		await page.locator(`a[href="${path}"], a[href="${path}/"]`).first().click();
		await page.waitForURL(
			(url) => url.pathname.replace(/\/$/, "") === path.replace(/\/$/, ""),
		);
		await checkTheme();
		if (
			!(await page.evaluate(
				() =>
					(window as unknown as { __themeCanvas: Element }).__themeCanvas ===
					document.querySelector(".bh-background-live"),
			))
		)
			throw Error("Navigation replaced the live canvas");
	}
	await page.locator("[data-explore-trigger]").click();
	await page.locator("[data-explore-settings]").click();
	const controls = await page
		.locator(".explore-settings")
		.evaluate((element) => ({
			background: getComputedStyle(element).backgroundColor,
			colour: getComputedStyle(element).color,
		}));
	if (
		controls.background !== "rgba(255, 255, 255, 0.96)" ||
		controls.colour !== "rgb(16, 36, 91)"
	)
		throw Error(JSON.stringify(controls));
	await page
		.getByRole("checkbox", { name: "ASCII effect", exact: true })
		.uncheck();
	await page
		.getByRole("checkbox", { name: "ASCII effect", exact: true })
		.check();
	await page.keyboard.press("Escape");
	// Escape first closes settings, then exits Explore.
	await page.keyboard.press("Escape");
	await page.waitForFunction(
		() => !document.body.classList.contains("bh-exploring"),
	);
	await page.keyboard.press("Tab");
	const focus = await page.evaluate(() => {
		if (!document.activeElement) throw Error("No focused element");
		const style = getComputedStyle(document.activeElement);
		return { width: style.outlineWidth, colour: style.outlineColor };
	});
	if (focus.width !== "2px" || focus.colour !== "rgb(43, 31, 212)")
		throw Error(`Focus lost: ${JSON.stringify(focus)}`);
	await page.goto(`${origin}/404`);
	await checkTheme();
	await page.goto(`${origin}/blog/site-and-terminal`);
	await checkTheme();
	await page.setViewportSize({ width: 390, height: 844 });
	for (const path of [
		"/",
		"/blog",
		"/blog/contracts-in-rust-and-cpp",
		"/blog/site-and-terminal",
		"/socials",
		"/404",
	]) {
		await page.goto(`${origin}${path}`);
		await checkTheme();
		await page
			.locator(".bh-background-still")
			.evaluate((image) => (image as HTMLImageElement).decode());
		if (await page.locator(".bh-background-live").isVisible())
			throw Error("Mobile started a live canvas");
	}
	await page.goto(`${origin}/`);
	await page.screenshot({
		path: ".playwright-cli/white-blue-mobile.png",
		scale: "css",
	});
	for (const scenario of ["loading", "no-javascript", "no-gpu"] as const) {
		const browser = page.context().browser();
		if (!browser) throw Error("Browser connection missing");
		const context = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
			javaScriptEnabled: scenario !== "no-javascript",
		});
		let releaseRenderer = () => {};
		try {
			if (scenario === "loading") {
				const pendingRenderer = new Promise<void>((resolve) => {
					releaseRenderer = resolve;
				});
				await context.route("**/_astro/index.*.js", async (route) => {
					await pendingRenderer;
					await route.continue();
				});
			}
			if (scenario === "no-gpu")
				await context.addInitScript(() => {
					Object.defineProperty(navigator, "gpu", { value: undefined });
					const original = HTMLCanvasElement.prototype.getContext;
					HTMLCanvasElement.prototype.getContext = function (
						this: HTMLCanvasElement,
						kind: string,
						...args: unknown[]
					) {
						if (kind === "webgl" || kind === "webgl2" || kind === "webgpu")
							return null;
						return Reflect.apply(original, this, [kind, ...args]);
					} as typeof original;
				});
			const fallback = await context.newPage();
			await fallback.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
			if (scenario === "no-gpu")
				await fallback.waitForFunction(
					() =>
						document.querySelector<HTMLElement>("[data-black-hole-background]")
							?.dataset.bhFallback === "true",
				);
			const still = fallback.locator(".bh-background-still");
			await still.evaluate((image) => (image as HTMLImageElement).decode());
			if (!(await still.isVisible()))
				throw Error(`${scenario} has no visible fallback`);
			await fallback.screenshot({
				path: `.playwright-cli/white-blue-${scenario}.png`,
				scale: "css",
			});
			states.push({ scenario, fallback: "white-and-blue still visible" });
		} finally {
			releaseRenderer();
			await context.close();
		}
	}
	if (errors.length) throw Error(JSON.stringify(errors));
	return { states, errors, focus, controls };
}
