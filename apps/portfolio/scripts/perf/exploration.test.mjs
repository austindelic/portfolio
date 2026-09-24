import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
	new URL("../../src/components/BlackHoleRuntime.ts", import.meta.url),
	"utf8",
);
const exploration = ts.transpile(
	source.slice(
		source.indexOf("\tlet explorationEntry:"),
		source.indexOf("\n\tconst handleMotionPreferenceChange"),
	),
	{ target: ts.ScriptTarget.ES2022 },
);

test("exit preserves the complete explored pose; reset uses each session's entry", () => {
	const camera = {
		position: [0, 0, 10],
		forward: [0, 0, -1],
		right: [1, 0, 0],
		up: [0, 1, 0],
		universeSign: 1,
	};
	const state = { controls: { timeScale: 1, exposure: 1, bloomStrength: 0.2 } };
	let clears = 0;
	const status = new Function(
		"camera",
		"state",
		"clearInput",
		"window",
		"canvas",
		`let disposed = false, contextLost = false, exploring = false;
		let heldCameraPath = null, movementSpeed = 2.5, lastTime = 0;
		const snapshotRuntime = () => {}, requestRender = () => {};
		${exploration}
		return () => ({ exploring, heldCameraPath });`,
	)(
		camera,
		state,
		() => clears++,
		{ location: { pathname: "/blog/one" } },
		new EventTarget(),
	);
	const controls = { ...state.controls };
	assert.equal(state.exploration.enter(), true);
	Object.assign(camera, {
		position: [2, 3, 9],
		forward: [1, 0, 0],
		right: [0, 1, 0],
		up: [0, 0, 1],
		universeSign: -1,
	});
	const explored = structuredClone(camera);
	state.exploration.exit();
	assert.deepEqual(
		camera,
		explored,
		"position, orientation and roll must survive exit",
	);
	assert.deepEqual(state.controls, controls);
	assert.deepEqual(status(), { exploring: false, heldCameraPath: "/blog/one" });
	assert.equal(clears, 2);
	assert.equal(state.exploration.enter(), true);
	camera.position = [20, 30, 90];
	camera.up = [0, 1, 0];
	state.exploration.reset();
	assert.deepEqual(camera, { ...explored, asciiHistoryVersion: 1 });
	state.exploration.exit();
	assert.deepEqual(camera, { ...explored, asciiHistoryVersion: 1 });
});
