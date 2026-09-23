import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Exercise the actual controller against an observable GPU-session boundary.
const source = await readFile(
	new URL("../../src/components/BlackHoleRuntime.ts", import.meta.url),
	"utf8",
);
const controller = ts
	.transpile(
		source.slice(source.indexOf("export function mountBlackHoleRuntime")),
		{
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
		},
	)
	.replace("export function", "function");
function fixture(fontReady = true) {
	const sessions = [],
		loads = [];
	const fonts = {
		check: () => fontReady,
		load: () => new Promise((resolve) => loads.push(resolve)),
	};
	const mount = new Function(
		"startBlackHoleSession",
		"document",
		"formatError",
		"createGlyphAtlasConfig",
		controller + "; return mountBlackHoleRuntime;",
	)(
		(canvas, state, options) => {
			const session = { canvas, state, options, disposals: 0 };
			sessions.push(session);
			return () => session.disposals++;
		},
		{ fonts },
		String,
		(controls) => ({ ...controls }),
	);
	const state = {
		atlasConfig: { textSize: 10, fontFamily: "Test" },
		controls: {},
		runtimeSnapshot: { frame: 3 },
		requestRender() {
			this.requests = (this.requests || 0) + 1;
		},
		resetFrame() {
			this.resets = (this.resets || 0) + 1;
		},
	};
	const errors = [];
	const runtime = mount({}, state, { onError: (error) => errors.push(error) });
	return { runtime, state, sessions, loads, errors };
}
test("ordinary route updates retain ownership; disposal is idempotent", async () => {
	const f = fixture();
	f.runtime.updateRoute("/blog/");
	f.runtime.updateRoute("/socials/", true);
	assert.equal(f.sessions.length, 1);
	assert.equal(f.state.resets, 1);
	assert.equal(f.state.animationRoute, "/socials/");
	f.sessions[0].options.onReady();
	assert.equal(await f.runtime.ready, true);
	const snapshot = f.runtime.snapshot();
	snapshot.frame = 99;
	assert.equal(f.state.runtimeSnapshot.frame, 3);
	f.runtime.dispose();
	f.runtime.dispose();
	f.runtime.updateRoute("/");
	assert.equal(f.sessions[0].disposals, 1);
	assert.equal(f.state.animationRoute, "/socials/");
});
test("font readiness cannot create a session after disposal", async () => {
	const f = fixture(false);
	f.runtime.dispose();
	f.loads[0]();
	await Promise.resolve();
	assert.equal(await f.runtime.ready, false);
	assert.equal(f.sessions.length, 0);
});
test("obsolete font completion is ignored after settings change", async () => {
	const f = fixture(false);
	f.runtime.updateSettings({ asciiMix: 0.5 });
	f.loads[0]();
	await Promise.resolve();
	assert.equal(f.sessions.length, 0);
	f.loads[1]();
	await Promise.resolve();
	assert.equal(f.sessions.length, 1);
	assert.equal(f.sessions[0].options.asciiMix, 0.5);
	f.runtime.dispose();
});
test("context restoration replaces one owned session and errors settle readiness", async () => {
	const f = fixture();
	f.sessions[0].options.onContextRestored();
	assert.equal(f.sessions[0].disposals, 1);
	assert.equal(f.sessions.length, 2);
	f.sessions[1].options.onError("compile failed");
	assert.equal(await f.runtime.ready, false);
	assert.deepEqual(f.errors, ["compile failed"]);
	f.runtime.dispose();
	assert.equal(f.sessions[1].disposals, 1);
});
