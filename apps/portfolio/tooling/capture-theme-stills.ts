import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import themes from "../src/generated/themes.json";

const origin = process.env.PORTFOLIO_ORIGIN ?? "http://127.0.0.1:4321";
const only = new Set((process.env.THEME_IDS ?? "").split(",").filter(Boolean));
const output = fileURLToPath(
	new URL("../public/images/theme-stills/", import.meta.url),
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
	headless: true,
	args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"],
});
try {
	const page = await browser.newPage({
		viewport: { width: 1200, height: 1200 },
		deviceScaleFactor: 1,
	});
	await page.goto(
		`${origin}/?bhPerf=theme-capture,hide-content,no-clock,no-route-animation&bhDebug`,
		{ waitUntil: "networkidle" },
	);
	await page.locator("[data-bh-live='true']").waitFor({ timeout: 60_000 });
	await page.locator("astro-dev-toolbar").evaluateAll((elements) => {
		for (const element of elements) element.remove();
	});
	for (const theme of themes.filter(
		(item) => item.id !== "original" && (only.size === 0 || only.has(item.id)),
	)) {
		await page.evaluate((id) => {
			document
				.querySelector<HTMLButtonElement>("[data-theme-trigger]")
				?.click();
			document
				.querySelector<HTMLButtonElement>(`[data-theme-id="${id}"]`)
				?.click();
		}, theme.id);
		await page.waitForFunction(
			(id) =>
				document.documentElement.dataset.theme === id &&
				document
					.querySelector("[data-black-hole-background]")
					?.getAttribute("data-bh-live") === "true" &&
				(
					window as typeof window & {
						__blackHoleStats?: { paletteMode?: string };
					}
				).__blackHoleStats?.paletteMode === "theme",
			theme.id,
		);
		// Allow the renderer to clear history and accumulate several themed frames.
		// Without this delay, software WebGL can capture the preceding palette.
		await page.waitForTimeout(1200);
		const image = await page.locator(".bh-background-live").screenshot();
		await sharp(image)
			.webp({ quality: 78, effort: 5 })
			.toFile(`${output}/${theme.id}.webp`);
		console.log(`Captured ${theme.id}`);
	}
	await page.close();
} finally {
	await browser.close();
}
