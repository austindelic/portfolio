import { expect, test } from "bun:test";
import {
	asciiSampleSide,
	asciiSourceDimension,
	glyphDirection,
	rankGlyphs,
} from "../src/lib/ascii-analysis";

test("measured density order is monotonic and stable, including equal-ink glyphs", () => {
	const ranked = rankGlyphs([0.3, 0, 0.1, 0.3, 0.6]);
	expect(ranked.map((x) => x.index)).toEqual([1, 2, 0, 3, 4]);
	ranked.forEach((entry, i) => {
		expect(entry.density).toBeCloseTo([0, 1 / 6, 0.5, 0.5, 1][i], 8);
	});
});
test("direction metadata uses canonical upward-positive axes", () => {
	expect(["-", "/", "|", "\\", "A", " "].map(glyphDirection)).toEqual([
		1, 2, 3, 4, 0, 0,
	]);
});
test("source sample budgets are bounded by canvas pixels", () => {
	expect(asciiSampleSide(0.5)).toBe(2);
	expect(asciiSampleSide(0.72)).toBe(4);
	expect(asciiSourceDimension(1200, 6, 0.72, 0.36)).toBe(800);
	expect(asciiSourceDimension(600, 6, 0.72, 0.36)).toBe(400);
	expect(asciiSourceDimension(1200, 2, 1, 1)).toBe(1200);
});
