import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
	new URL("../../src/components/BlackHoleCompilation.ts", import.meta.url),
	"utf8",
);
const { submitPrograms } = await import(
	`data:text/javascript;base64,${Buffer.from(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })).toString("base64")}`
);
function mock(parallel = true) {
	const calls = [],
		deleted = new Set();
	let id = 0;
	return {
		calls,
		deleted,
		complete: false,
		valid: true,
		VERTEX_SHADER: 1,
		FRAGMENT_SHADER: 2,
		LINK_STATUS: 3,
		getExtension: () => (parallel ? { COMPLETION_STATUS_KHR: 4 } : null),
		createProgram() {
			const p = { id: ++id };
			calls.push("create");
			return p;
		},
		createShader: () => ({ id: ++id }),
		shaderSource() {},
		compileShader() {
			calls.push("compile");
		},
		attachShader() {},
		linkProgram() {
			calls.push("link");
		},
		getProgramParameter(p, key) {
			calls.push(key === 4 ? "poll" : "status");
			return key === 4 ? this.complete : this.valid;
		},
		getShaderInfoLog: () => "injected shader error",
		getProgramInfoLog: () => "",
		deleteProgram(p) {
			assert.ok(!deleted.has(p));
			deleted.add(p);
		},
		deleteShader(s) {
			assert.ok(!deleted.has(s));
			deleted.add(s);
		},
	};
}
const sources = ["A", "Image", "ASCII"].map((name) => ({
	name,
	vertex: "vertex",
	fragment: "fragment",
}));
test("submits all links before polling; unavailable results do not query link status", () => {
	const gl = mock(),
		batch = submitPrograms(gl, sources);
	assert.equal(gl.calls.filter((x) => x === "link").length, 3);
	assert.ok(!gl.calls.includes("status"));
	assert.equal(batch.finish(), null);
	assert.ok(!gl.calls.includes("status"));
	gl.complete = true;
	const programs = batch.finish();
	assert.equal(programs.length, 3);
	assert.equal(gl.deleted.size, 6);
	batch.cancel();
	assert.equal(gl.deleted.size, 6);
});
test("synchronous fallback validates all programs", () => {
	const gl = mock(false),
		batch = submitPrograms(gl, sources);
	assert.equal(batch.finish().length, 3);
	assert.ok(!gl.calls.includes("poll"));
});
test("cancel is idempotent and obsolete completion cannot publish programs", () => {
	const gl = mock(),
		batch = submitPrograms(gl, sources);
	batch.cancel();
	batch.cancel();
	gl.complete = true;
	assert.equal(batch.finish(), null);
	assert.equal(gl.deleted.size, 9);
});
test("failure preserves shader diagnostics and frees entire batch", () => {
	const gl = mock();
	gl.complete = true;
	gl.valid = false;
	const batch = submitPrograms(gl, sources);
	assert.throws(() => batch.finish(), /injected shader error/);
	assert.equal(gl.deleted.size, 9);
	batch.cancel();
});
test("partial allocation failure frees submitted programs and shaders", () => {
	const gl = mock();
	let count = 0;
	gl.createShader = () => (++count === 3 ? null : { count });
	assert.throws(() => submitPrograms(gl, sources), /Could not create/);
	assert.equal(gl.deleted.size, 4);
});
test("unexpected editor effect can synchronously finish without omitting an effect", () => {
	const gl = mock(),
		batch = submitPrograms(gl, sources);
	assert.equal(batch.finish(true).length, 3);
	assert.ok(!gl.calls.includes("poll"));
});
