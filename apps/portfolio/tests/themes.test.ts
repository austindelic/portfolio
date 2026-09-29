import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { themeNames } from "@shikijs/themes";
import themes from "../src/generated/themes.json";

const root = new URL("../", import.meta.url);
const parse = (hex: string) =>
	[1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
const luminance = (hex: string) => {
	const [r, g, b] = parse(hex).map((value) => {
		const channel = value / 255;
		return channel <= 0.04045
			? channel / 12.92
			: ((channel + 0.055) / 1.055) ** 2.4;
	});
	return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const contrast = (a: string, b: string) => {
	const x = luminance(a),
		y = luminance(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test("every pinned Shiki theme has a complete, readable portfolio port and still", () => {
	assert.equal(themes.length, themeNames.length + 1);
	assert.equal(themes[0].id, "original");
	assert.equal(new Set(themes.map((theme) => theme.id)).size, themes.length);
	assert.ok(themes.some((theme) => theme.type === "light"));
	assert.ok(themes.some((theme) => theme.type === "dark"));
	const generatedCss = readFileSync(
		new URL("src/generated/themes.css", root),
		"utf8",
	);
	for (const theme of themes) {
		assert.match(
			generatedCss,
			new RegExp(`html\\[data-theme="${theme.id}"\\]`),
		);
		assert.equal(Object.keys(theme.ui).length, 8, theme.id);
		assert.equal(Object.keys(theme.syntax).length, 10, theme.id);
		assert.equal(Object.keys(theme.shader).length, 3, theme.id);
		assert.equal(new Set(Object.values(theme.shader)).size, 3, theme.id);
		for (const value of [
			...Object.values(theme.ui),
			...Object.values(theme.syntax),
			...Object.values(theme.shader),
		])
			assert.match(value, /^#[0-9a-f]{6}$/i, theme.id);
		if (theme.id !== "original") {
			assert.ok(
				contrast(theme.ui.foreground, theme.ui.surface) >= 4.45,
				theme.id,
			);
			assert.ok(contrast(theme.ui.muted, theme.ui.surface) >= 4.45, theme.id);
			assert.ok(contrast(theme.ui.accent, theme.ui.surface) >= 2.95, theme.id);
			assert.ok(
				contrast(theme.ui.accentText, theme.ui.accent) >= 4.45,
				theme.id,
			);
			assert.ok(
				existsSync(
					new URL(`public/images/theme-stills/${theme.id}.webp`, root),
				),
				theme.id,
			);
		}
	}
	assert.ok(existsSync(new URL("public/theme-notices.txt", root)));
});
