import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { compactShader } from "../../tooling/compact-shaders.mjs";

const stripComments = (text) =>
	text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");
const tokens = (text) =>
	stripComments(text).match(
		/[a-zA-Z_]\w*|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[uUfF]?|<<=|>>=|\+\+|--|&&|\|\||==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|[^\s]/g,
	);

test("all GLSL tokens and preprocessor boundaries survive compaction", async () => {
	const directory = new URL("../../src/shaders/black-hole/", import.meta.url);
	for (const name of await readdir(directory)) {
		if (!name.endsWith(".glsl")) continue;
		const source = await readFile(new URL(name, directory), "utf8");
		const compact = compactShader(source);
		assert.deepEqual(tokens(compact), tokens(source), name);
		const directives = (text) =>
			stripComments(text)
				.split("\n")
				.filter((line) => /^\s*#/.test(line))
				.map((line) => line.trim().replace(/[\t ]+/g, " "));
		assert.deepEqual(directives(compact), directives(source), name);
		assert.ok(compact.length <= source.length);
	}
});

test("macro kinds, separated operators, and the core split marker remain intact", () => {
	const source =
		"#define OBJECT (x)\n#define FUNCTION(x) (x)\nfloat x = a + +b;\n// SECTION 9: mainImage (entry)\nvoid mainImage() {}";
	const compact = compactShader(source);
	assert.ok(
		compact.startsWith("#define OBJECT (x)\n#define FUNCTION(x) (x)\n"),
	);
	assert.ok(compact.includes("a + +b"));
	assert.ok(compact.includes("// SECTION 9: mainImage\n"));
});

test("generated WGSL tokens survive whitespace compaction", async () => {
	const directory = new URL(
		"../../src/shaders/black-hole/webgpu/",
		import.meta.url,
	);
	for (const name of await readdir(directory)) {
		if (!name.endsWith(".wgsl")) continue;
		const source = await readFile(new URL(name, directory), "utf8");
		assert.deepEqual(tokens(compactShader(source)), tokens(source), name);
	}
});
