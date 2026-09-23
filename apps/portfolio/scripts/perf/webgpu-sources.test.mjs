import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../../", import.meta.url);
test("checked-in WGSL corresponds to the current GLSL and runtime shader headers", async () => {
	const manifest = JSON.parse(
		await readFile(
			new URL("src/shaders/black-hole/webgpu/sources.json", root),
			"utf8",
		),
	);
	const core = await readFile(
		new URL("src/components/BlackHoleGl.ts", root),
		"utf8",
	);
	for (const [name, expected] of Object.entries(manifest.sourceHashes)) {
		const source =
			name === "header"
				? core.match(/export const FRAGMENT_HEADER = `([\s\S]*?)`;/)[1]
				: name === "helpers"
					? core.match(/export const BLACK_HOLE_HELPERS = `([\s\S]*?)`;/)[1]
					: await readFile(
							new URL(`src/shaders/black-hole/${name}.glsl`, root),
							"utf8",
						);
		assert.equal(
			createHash("sha256").update(source).digest("hex"),
			expected,
			`${name}: regenerate WGSL with tooling/webgpu/port-shaders.mjs`,
		);
	}
});
