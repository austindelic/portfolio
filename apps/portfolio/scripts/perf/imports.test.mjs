import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared renderer modules have no React or editor adapter imports", async () => {
	for (const name of [
		"BlackHoleCore.ts",
		"BlackHoleRuntime.ts",
		"BlackHoleAlternateRenderer.ts",
		"BlackHoleCompilation.ts",
	]) {
		const text = await readFile(
			new URL("../../src/components/" + name, import.meta.url),
			"utf8",
		);
		assert.doesNotMatch(
			text,
			/(?:from\s*|import\s*\()\s*["'](?:react(?:\/|["'])|\.\/BlackHoleShader["'])/,
		);
	}
});
