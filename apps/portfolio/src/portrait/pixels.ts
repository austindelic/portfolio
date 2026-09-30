import { getPreset, type PortraitSettings, palettes } from "./settings";

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const rgb = (hex: string) =>
	[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
// Small bitmap glyphs keep browser and build-time ASCII renders identical.
const glyphs = [
	[0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 4, 0],
	[0, 4, 0, 0, 4, 0, 0],
	[0, 0, 0, 31, 0, 0, 0],
	[0, 4, 4, 31, 4, 4, 0],
	[0, 21, 14, 31, 14, 21, 0],
	[0, 31, 0, 31, 0, 31, 0],
	[10, 31, 10, 10, 31, 10, 0],
	[17, 2, 4, 8, 17, 0, 0],
	[14, 17, 23, 21, 23, 16, 14],
];

/** Pure RGBA transform shared by static artwork and the live Canvas 2D view. */
export function renderPixels(
	source: Uint8ClampedArray,
	width: number,
	height: number,
	settings: PortraitSettings,
) {
	const output = new Uint8ClampedArray(source.length);
	const finish = () => {
		if (settings.scanlines) {
			for (let y = 0; y < height; y++) {
				if (y % 4 < 2) continue;
				for (let x = 0; x < width; x++) {
					const offset = (y * width + x) * 4;
					for (let channel = 0; channel < 3; channel++)
						output[offset + channel] *= 0.72;
				}
			}
		}
		return output;
	};
	const luminance = new Float32Array(width * height);
	const colors = palettes[settings.palette].colors.map(rgb);
	const treatment = getPreset(settings.preset).treatment;
	const step = settings.grain;
	for (let i = 0; i < luminance.length; i++) {
		const offset = i * 4;
		luminance[i] = clamp(
			((source[offset] * 0.2126 +
				source[offset + 1] * 0.7152 +
				source[offset + 2] * 0.0722) /
				255 -
				0.5) *
				settings.contrast +
				0.5 +
				settings.brightness,
		);
	}
	const at = (x: number, y: number) =>
		luminance[
			Math.min(height - 1, Math.max(0, y)) * width +
				Math.min(width - 1, Math.max(0, x))
		];
	const put = (x: number, y: number, color: number[]) => {
		const offset = (y * width + x) * 4;
		output[offset] = color[0];
		output[offset + 1] = color[1];
		output[offset + 2] = color[2];
		output[offset + 3] = 255;
	};
	const tone = (value: number) => {
		const pos = clamp(value) * 3;
		const low = Math.floor(pos);
		return colors[low].map(
			(channel, index) =>
				channel + (colors[Math.min(3, low + 1)][index] - channel) * (pos - low),
		);
	};
	if (treatment === "ascii") {
		const scale = Math.max(1, Math.round(step / 2));
		const cw = 6 * scale;
		const ch = 8 * scale;
		for (let y = 0; y < height; y += ch)
			for (let x = 0; x < width; x += cw) {
				let sum = 0;
				let count = 0;
				for (let yy = y; yy < Math.min(y + ch, height); yy++)
					for (let xx = x; xx < Math.min(x + cw, width); xx++) {
						sum += at(xx, yy);
						count++;
					}
				const light = sum / count;
				const glyph = glyphs[Math.min(9, Math.floor(light * 10))];
				const ink = tone(0.45 + light * 0.55);
				for (let yy = y; yy < Math.min(y + ch, height); yy++)
					for (let xx = x; xx < Math.min(x + cw, width); xx++) {
						const gx = Math.floor((xx - x) / scale);
						const gy = Math.floor((yy - y) / scale);
						put(
							xx,
							yy,
							gy < 7 && gx < 5 && glyph[gy] & (1 << (4 - gx)) ? ink : colors[0],
						);
					}
			}
		return finish();
	}
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const gx = Math.floor(x / step);
			const gy = Math.floor(y / step);
			const bx = gx * step;
			const by = gy * step;
			const light = at(x, y);
			const blockLight = at(
				bx + Math.floor(step / 2),
				by + Math.floor(step / 2),
			);
			const threshold = (bayer[(gy % 4) * 4 + (gx % 4)] + 0.5) / 16;
			let color: number[];
			switch (treatment) {
				case "original": {
					const offset = (y * width + x) * 4;
					color = [0, 1, 2].map(
						(channel) =>
							clamp(
								(source[offset + channel] / 255 - 0.5) * settings.contrast +
									0.5 +
									settings.brightness,
							) * 255,
					);
					break;
				}
				case "halftone": {
					const radius = Math.sqrt(1 - blockLight) * step * 0.7;
					const distance = Math.hypot(
						x - bx - (step - 1) / 2,
						y - by - (step - 1) / 2,
					);
					const edge = clamp(distance - radius + 0.5);
					color = colors[0].map(
						(channel, index) => channel + (colors[3][index] - channel) * edge,
					);
					break;
				}
				case "stipple": {
					let hash =
						Math.imul(gx + 1, 374761393) ^ Math.imul(gy + 1, 668265263);
					hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
					color =
						blockLight > (hash >>> 0) / 4294967296 ? colors[3] : colors[0];
					break;
				}
				case "mosaic":
					color = colors[Math.min(3, Math.floor(blockLight * 4))];
					break;
				case "quantize":
					color = colors[Math.min(3, Math.floor(blockLight * 3 + threshold))];
					break;
				case "blueprint": {
					const edge =
						Math.abs(at(x + step, y) - at(x - step, y)) +
						Math.abs(at(x, y + step) - at(x, y - step));
					const grid = x % (step * 12) === 0 || y % (step * 12) === 0;
					color = tone(
						Math.max(
							grid ? 0.22 : 0.04,
							Math.min(1, edge * 2.8 + light * 0.15),
						),
					);
					break;
				}
				case "riso": {
					const shifted = at(x + step * 2, y - step);
					color =
						light > 0.82
							? colors[3]
							: shifted > threshold + 0.13
								? colors[2]
								: light > threshold * 0.8
									? colors[1]
									: colors[0];
					break;
				}
				case "thermal": {
					const line = (gy % 4) / 4;
					color =
						blockLight > threshold * 0.6 + line * 0.4 ? colors[3] : colors[0];
					break;
				}
				case "crt":
					color = tone(blockLight * (gx % 3 === 0 ? 0.85 : 1));
					break;
				default:
					color = blockLight > threshold ? colors[3] : colors[0];
			}
			put(x, y, color);
		}
	return finish();
}
