/** Pure glyph metadata shared by the WebGL and WebGPU atlas uploads. */
export function rankGlyphs(coverage: number[]) {
	const order = coverage
		.map((_, i) => i)
		.sort((a, b) => coverage[a] - coverage[b] || a - b);
	const maximum = Math.max(0.001, ...coverage);
	return order.map((index) => ({
		index,
		coverage: coverage[index],
		density: coverage[index] / maximum,
	}));
}

// Encoded in an 8-bit metric channel, zero means a non-directional glyph.
export function glyphDirection(glyph: string) {
	return (
		({ "-": 1, "/": 2, "|": 3, "\\": 4 } as Record<string, number>)[glyph] ?? 0
	);
}

export function asciiSampleSide(quality: number) {
	return quality < 0.7 ? 2 : 4;
}

export function asciiSourceDimension(
	pixels: number,
	cell: number,
	quality: number,
	scale: number,
) {
	return Math.min(
		pixels,
		Math.max(
			Math.ceil(pixels * scale),
			Math.ceil(pixels / Math.max(2, cell)) * asciiSampleSide(quality),
		),
	);
}
