// Pixel assertions for screenshots captured by white-blue-renderer.browser.ts.
// Browser screenshots read the composited WebGPU frame; drawImage(canvas)
// outside the GPU submission turn can instead read an expired swap texture.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import sharp from "sharp";

for (const backend of ["webgl2", "webgpu"]) {
	for (const variant of [
		"ascii",
		"continuous",
		"cell",
		"source",
		"bloom-zero",
	]) {
		test(`${backend}: ${variant} has the expected sky and scene colours`, async () => {
			const { data, info } = await sharp(
				resolve(`.playwright-cli/white-blue-${backend}-${variant}.png`),
			)
				.removeAlpha()
				.raw()
				.toBuffer({ resolveWithObject: true });
			let white = 0,
				navy = 0,
				blue = 0,
				orange = 0;
			for (let i = 0; i < data.length; i += 3) {
				const r = data[i],
					g = data[i + 1],
					b = data[i + 2];
				if (r === 255 && g === 255 && b === 255) white++;
				if (
					Math.abs(r - 16) <= 1 &&
					Math.abs(g - 36) <= 1 &&
					Math.abs(b - 91) <= 1
				)
					navy++;
				if (b > r + 25 && b > g + 15) blue++;
				if (r > 80 && r > b + 30 && g > b + 10) orange++;
			}
			if (variant === "source") {
				assert.ok(
					white < info.width * info.height * 0.1 && orange > 1000,
					"Default source appearance changed",
				);
				return;
			}
			// The disc reaches the lower corners; the upper corners are empty sky.
			assert.deepEqual(Array.from(data.subarray(0, 3)), [255, 255, 255]);
			assert.deepEqual(
				Array.from(data.subarray((info.width - 1) * 3, info.width * 3)),
				[255, 255, 255],
			);
			assert.ok(white > info.width * info.height * 0.25, "White sky missing");
			assert.ok(navy > 1000, "Deep-blue captured centre missing");
			assert.ok(blue > 5000, "Blue disc shading missing");
			assert.equal(
				orange,
				0,
				"Warm source colours leaked into blue appearance",
			);
		});
	}
	test(`${backend}: Bloom changes blue shading without colouring the sky`, async () => {
		const paths = ["ascii", "bloom-zero"].map((variant) =>
			resolve(`.playwright-cli/white-blue-${backend}-${variant}.png`),
		);
		const [withBloom, withoutBloom] = await Promise.all(
			paths.map((path) => sharp(path).removeAlpha().raw().toBuffer()),
		);
		assert.equal(withBloom.length, withoutBloom.length);
		let changed = 0;
		for (let i = 0; i < withBloom.length; i++)
			if (withBloom[i] !== withoutBloom[i]) changed++;
		assert.ok(changed > 100, "Bloom control has no visible effect");
	});
}
