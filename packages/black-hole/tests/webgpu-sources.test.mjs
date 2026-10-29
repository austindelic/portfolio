import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url);
test("checked-in WGSL corresponds to the current GLSL and runtime shader headers", async () => {
	const manifest = JSON.parse(
		await readFile(
			new URL("shaders/webgpu/sources.json", root),
			"utf8",
		),
	);
	for (const [name, expected] of Object.entries(manifest.sourceHashes)) {
		const source = await readFile(
			new URL(`shaders/${name === "header" ? "fragment-header" : name}.glsl`, root),
			"utf8",
		);
		assert.equal(
			createHash("sha256").update(source).digest("hex"),
			expected,
			`${name}: regenerate WGSL with tooling/webgpu/port-shaders.mjs`,
		);
	}
});
