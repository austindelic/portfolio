import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { renderPixels } from "../src/portrait/pixels";
import { defaults, faceCrop, presets } from "../src/portrait/settings";

// Supply the original once; subsequent runs use the checked-in optimized source.
const directory = resolve(import.meta.dirname, "../public/images/portraits");
const source = process.argv[2] ?? resolve(directory, "profile.webp");
await mkdir(directory, { recursive: true });
const optimized = process.argv[2]
	? await sharp(source)
			.rotate()
			.resize(800, 800, { fit: "cover" })
			.webp({ quality: 92 })
			.toBuffer()
	: await readFile(source);
if (process.argv[2])
	await sharp(optimized).toFile(resolve(directory, "profile.webp"));
const left = Math.round(800 * faceCrop.left);
const top = Math.round(800 * faceCrop.top);
const size = Math.round(800 * faceCrop.size);
const face = await sharp(optimized)
	.extract({ left, top, width: size, height: size })
	.resize(480, 480)
	.ensureAlpha()
	.raw()
	.toBuffer();
await sharp(face, { raw: { width: 480, height: 480, channels: 4 } })
	.webp({ quality: 90 })
	.toFile(resolve(directory, "face.webp"));
for (const preset of presets) {
	const pixels = renderPixels(
		new Uint8ClampedArray(face),
		480,
		480,
		defaults(preset.id),
	);
	await sharp(pixels, { raw: { width: 480, height: 480, channels: 4 } })
		.webp({
			lossless: !["original", "blueprint", "crt"].includes(preset.treatment),
			quality: 92,
		})
		.toFile(resolve(directory, `${preset.id}.webp`));
}
console.log(
	`Generated ${presets.length} printed studies in ${dirname(resolve(directory, "face.webp"))}`,
);
