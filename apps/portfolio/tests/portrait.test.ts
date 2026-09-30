import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { renderPixels } from "../src/portrait/pixels";
import {
	defaults,
	presets,
	readSettings,
	settingsURL,
} from "../src/portrait/settings";

test("portrait links preserve every control across static-page reloads", () => {
	for (const preset of presets) {
		const settings = {
			...defaults(preset.id),
			crop: "full" as const,
			placement: "banner" as const,
			brightness: -0.12,
			grain: 7,
			tilt: true,
			reveal: true,
		};
		for (const path of ["/", "/portrait-lab"] as const) {
			assert.deepEqual(
				readSettings(
					settingsURL(settings, path, "https://example.com").searchParams,
				),
				settings,
			);
		}
	}
});
test("invalid query values default safely and tuning stays bounded", () => {
	assert.deepEqual(
		readSettings(
			new URLSearchParams(
				"portrait=unknown&palette=__proto__&placement=constructor&crop=bad&contrast=NaN&grain=&brightness=Infinity",
			),
		),
		defaults(),
	);
	const clamped = readSettings(
		new URLSearchParams("grain=99&contrast=-1&brightness=2&tilt=1"),
	);
	assert.equal(clamped.grain, 16);
	assert.equal(clamped.contrast, 0.65);
	assert.equal(clamped.brightness, 0.2);
	assert.equal(clamped.tilt, true);
	assert.equal(
		readSettings(new URLSearchParams("portrait=crt-portrait")).scanlines,
		true,
	);
	assert.equal(
		readSettings(new URLSearchParams("portrait=crt-portrait&scanlines=0"))
			.scanlines,
		false,
	);
});
test("printed treatments are deterministic, distinct and never mutate the photograph", () => {
	const width = 48;
	const height = 48;
	const source = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			source.set([x * 5, y * 5, (x + y) * 2, 255], i);
		}
	const original = source.slice();
	const hashes = new Set<string>();
	for (const preset of presets) {
		const settings = defaults(preset.id);
		const pixels = renderPixels(source, width, height, settings);
		assert.equal(pixels.length, source.length);
		assert.deepEqual(pixels, renderPixels(source, width, height, settings));
		for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
		hashes.add(createHash("sha256").update(pixels).digest("hex"));
	}
	assert.equal(hashes.size, 12);
	assert.deepEqual(source, original);
	assert.deepEqual(
		renderPixels(source, width, height, defaults("original")),
		source,
	);
	assert.notDeepEqual(
		renderPixels(source, width, height, { ...defaults(), scanlines: true }),
		renderPixels(source, width, height, defaults()),
	);
});
