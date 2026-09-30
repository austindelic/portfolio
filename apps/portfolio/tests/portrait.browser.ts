import type { Page } from "@playwright/test";

// Compile with `bun run prepare:browser apps/portfolio/tests/portrait.browser.ts`
// and run through Playwright CLI's run-code --filename option against the built site.
export default async function verifyPortrait(page: Page) {
	const origin = page.url().split("/").slice(0, 3).join("/");
	const query = () =>
		page.evaluate(() =>
			Object.fromEntries(new URL(location.href).searchParams),
		);
	const errors: string[] = [];
	const failed: string[] = [];
	page.on("pageerror", (error) =>
		errors.push(`${page.url()}: ${error.message}`),
	);
	page.on("requestfailed", (request) => {
		if (!request.failure()?.errorText.includes("ERR_ABORTED"))
			failed.push(request.url());
	});
	page.on("response", (response) => {
		if (response.status() >= 400)
			failed.push(`${response.status()} ${response.url()}`);
	});
	const check = (condition: unknown, message: string) => {
		if (!condition) throw new Error(message);
	};
	const ready = async () => {
		await page.locator('[data-portrait-frame][data-ready="true"]').waitFor();
		await page.waitForFunction(
			() => !document.documentElement.hasAttribute("data-astro-transition"),
		);
	};
	const pixels = () =>
		page
			.locator("[data-portrait] canvas")
			.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
	const settled = () =>
		page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
				),
		);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto(`${origin}/portrait-lab`);
	await ready();
	check(
		(await page.locator('meta[name="robots"]').getAttribute("content")) ===
			"noindex, nofollow",
		"Gallery indexing policy",
	);
	const presetIds = await page
		.locator("[data-preset]")
		.evaluateAll((buttons) =>
			buttons.map((button) => (button as HTMLElement).dataset.preset),
		);
	check(presetIds.length === 12, "Expected twelve presets");
	const rendered = new Set<string>();
	for (const id of presetIds) {
		await page.locator(`[data-preset="${id}"]`).click();
		await settled();
		check((await query()).portrait === id, `Preset URL: ${id}`);
		check(
			(await page.locator('[data-preset][aria-pressed="true"]').count()) === 1,
			"Only one selected preset",
		);
		rendered.add(await pixels());
	}
	check(rendered.size === 12, "All twelve studies must render distinctly");
	await page.locator('[data-preset="amber-bayer"]').click();
	const paletteImages = new Set<string>();
	for (const palette of ["amber", "mono", "green", "blue", "olive", "riso"]) {
		await page
			.getByRole("combobox", { name: "Palette", exact: true })
			.selectOption(palette);
		await settled();
		paletteImages.add(await pixels());
	}
	check(paletteImages.size === 6, "All palettes must alter pixels");
	const beforeGrain = await pixels();
	await page.locator('[name="grain"]').focus();
	await page.keyboard.press("ArrowRight");
	await settled();
	check((await pixels()) !== beforeGrain, "Grain must change the image");
	for (const name of ["contrast", "brightness"]) {
		const before = await pixels();
		await page.locator(`[name="${name}"]`).focus();
		await page.keyboard.press("ArrowRight");
		await settled();
		check((await pixels()) !== before, `${name} must change the image`);
	}
	const beforeCrop = await pixels();
	await page
		.getByRole("combobox", { name: "Crop", exact: true })
		.selectOption("full");
	await settled();
	check((await pixels()) !== beforeCrop, "Crop must change the image");
	await page.getByLabel("Scanlines", { exact: true }).check();
	await settled();
	await page.getByLabel("Pointer tilt", { exact: true }).check();
	await page.getByLabel("Original reveal", { exact: true }).check();
	await page.locator("[data-reveal-button]").click();
	check(
		(await page
			.locator("[data-reveal-button]")
			.getAttribute("aria-pressed")) === "true",
		"Keyboard-accessible original reveal",
	);
	await page.locator("[data-reveal-button]").click();
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.locator("[data-portrait-frame]").hover();
	check(
		(await page
			.locator("[data-portrait-frame]")
			.evaluate((node) => getComputedStyle(node).transform)) === "none",
		"Reduced motion disables tilt",
	);
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page
		.getByRole("combobox", { name: "Homepage placement", exact: true })
		.selectOption("side");
	const saved = await page.evaluate(() => location.search);
	await page.reload();
	await ready();
	check(
		(await page
			.getByRole("combobox", { name: "Crop", exact: true })
			.inputValue()) === "full",
		"Crop survives reload",
	);
	check(
		(await page
			.getByRole("combobox", { name: "Homepage placement", exact: true })
			.inputValue()) === "side",
		"Placement survives reload",
	);
	check(
		await page.getByLabel("Pointer tilt", { exact: true }).isChecked(),
		"Effects survive reload",
	);
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	await page
		.getByRole("button", { name: "Copy preview link", exact: true })
		.click();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	check(
		(await page.evaluate((url) => new URL(url).search, copied)) === saved,
		"Copied link preserves all controls",
	);
	await page.locator("[data-action=reset]").click();
	await settled();
	check(
		(await page
			.getByRole("combobox", { name: "Palette", exact: true })
			.inputValue()) === "amber",
		"Reset restores preset palette",
	);
	check(
		!(await page.getByLabel("Pointer tilt", { exact: true }).isChecked()),
		"Reset turns motion off",
	);
	for (let i = 0; i < 10; i++) {
		await page.locator("[data-action=randomize]").click();
		await settled();
		const params = await query();
		check(
			Number(params.grain) <= 12 &&
				Number(params.contrast) >= 1 &&
				Math.abs(Number(params.brightness)) <= 0.06,
			"Random tuning stays readable",
		);
	}
	await page.locator('[data-preset="amber-bayer"]').click();
	await page.locator('[data-preset="original"]').scrollIntoViewIfNeeded();
	await page.waitForFunction(() =>
		Array.from(
			document.querySelectorAll<HTMLImageElement>(".portrait-thumbnail img"),
		).every((image) => image.complete && image.naturalWidth > 0),
	);
	await page.evaluate(() => scrollTo(0, 0));
	await page.screenshot({
		path: ".playwright-cli/portrait-lab-full.png",
		fullPage: true,
	});
	for (const placement of ["card", "side", "banner", "hero", "badge"]) {
		await page
			.getByRole("combobox", { name: "Homepage placement", exact: true })
			.selectOption(placement);
		await page.locator("[data-home-preview]").click();
		await page.locator("[data-home-portrait]").waitFor();
		await ready();
		check(
			(await page.locator("[data-home-portrait]").count()) === 1,
			`Single portrait for ${placement}`,
		);
		check(
			(await page.locator("#about").getAttribute("data-portrait-placement")) ===
				placement,
			`Correct ${placement} placement`,
		);
		check(
			await page.locator("#projects").isVisible(),
			"Projects remain visible",
		);
		await page.screenshot({
			path: `.playwright-cli/portrait-home-${placement}.png`,
			fullPage: true,
		});
		await page.locator("[data-back-to-lab]").click();
		await page.locator("[data-portrait-lab]").waitFor();
		await ready();
		check(
			(await page
				.getByRole("combobox", { name: "Homepage placement", exact: true })
				.inputValue()) === placement,
			"Back-to-lab preserves placement",
		);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({
		path: ".playwright-cli/portrait-lab-mobile.png",
		fullPage: true,
	});
	check(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
		"Mobile gallery must not overflow",
	);
	for (const placement of ["card", "side", "banner", "hero", "badge"]) {
		await page
			.getByRole("combobox", { name: "Homepage placement", exact: true })
			.selectOption(placement);
		await page.locator("[data-home-preview]").click();
		await page.locator("[data-home-portrait]").waitFor();
		await ready();
		check(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
			`Mobile ${placement} must not overflow`,
		);
		if (placement === "side")
			await page.screenshot({
				path: ".playwright-cli/portrait-home-mobile.png",
				fullPage: true,
			});
		await page.locator("[data-back-to-lab]").click();
		await page.locator("[data-portrait-lab]").waitFor();
		await ready();
	}
	await page.goto(
		`${origin}/portrait-lab?portrait=invalid&palette=constructor&placement=bad&grain=999&contrast=NaN&brightness=Infinity`,
	);
	await ready();
	check(
		(await page.locator("[data-selected-name]").textContent()) ===
			"Amber Bayer",
		"Invalid preset defaults",
	);
	check(
		(await page
			.getByRole("combobox", { name: "Palette", exact: true })
			.inputValue()) === "amber",
		"Invalid palette defaults",
	);
	check(
		(await page.locator('[name="grain"]').inputValue()) === "16",
		"Extreme grain clamps",
	);
	// Client navigation back from a page without the lab script must initialize again.
	await page.getByRole("link", { name: "blog", exact: true }).click();
	await page.goBack();
	await ready();
	await page.locator('[data-preset="game-boy"]').click();
	await settled();
	check(
		(await query()).portrait === "game-boy",
		"Controls reattach after navigation",
	);
	const ordinary = await page.context().newPage();
	await ordinary.goto(origin);
	await ordinary.locator("#about").waitFor();
	check(
		(await ordinary.locator("[data-home-portrait]").count()) === 0,
		"Ordinary homepage is unchanged",
	);
	check(
		await ordinary.evaluate(
			() =>
				!performance
					.getEntriesByType("resource")
					.some((entry) => entry.name.includes("/images/portraits/")),
		),
		"Ordinary home never downloads portrait images",
	);
	const sitemap = await page.request.get(`${origin}/sitemap-0.xml`);
	check(
		!(await sitemap.text()).includes("portrait-lab"),
		"Lab excluded from sitemap",
	);
	await ordinary.close();
	const noScript = await page
		.context()
		.browser()
		?.newContext({ javaScriptEnabled: false });
	if (noScript) {
		const staticPage = await noScript.newPage();
		await staticPage.goto(`${origin}/portrait-lab`);
		check(
			(await staticPage.locator(".portrait-thumbnail img").count()) === 12,
			"No-JS contact sheet",
		);
		check(
			await staticPage.locator(".portrait-fallback").isVisible(),
			"No-JS fallback",
		);
		await noScript.close();
	}
	check(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
	check(failed.length === 0, `Failed requests: ${failed.join("; ")}`);
	return {
		presets: presetIds.length,
		palettes: paletteImages.size,
		placements: 5,
		viewports: ["desktop", "mobile"],
		reloadAndNavigation: "passed",
		clipboard: "passed",
		reducedMotion: "passed",
		staticFallback: "passed",
		errors,
		failed,
	};
}
