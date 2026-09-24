import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
	new URL("../../src/components/BlackHoleOrbit.ts", import.meta.url),
	"utf8",
);
const code = ts.transpile(source, {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
});
const {
	createMotion,
	sampleOrbit,
	createBridge,
	sampleBridge,
	nearestOrbitPhase,
	BlackHoleOrbitController,
	varyOrbit,
	createOrbitFrame,
	frameIntroSequence,
	writeMotionFrame,
} = await import(
	`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const configSource = await readFile(
	new URL("../../src/config/black-hole-animation.ts", import.meta.url),
	"utf8",
);
const routeData = await readFile(
	new URL("../../src/data/black-hole-routes.json", import.meta.url),
	"utf8",
);
// The test imports transpiled source as a data URL, so inline its JSON dependency.
const configCode = ts.transpile(
	configSource.replace(/import routeData from "[^"\n]+";/, `const routeData = ${routeData};`),
	{ target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
);
const { BLACK_HOLE_ANIMATION_ROUTES: routes } = await import(
	`data:text/javascript;base64,${Buffer.from(configCode).toString("base64")}`
);
const orbit = routes["/"].orbit;
// At the current spin, the oblate event horizon fits inside radius 0.74.
const horizonClearance = 0.85;
const frame = () => ({
	position: [8, 3, 20],
	forward: [-0.3, -0.1, -0.95],
	universeSign: 1,
	duration: 0,
});
const close = (a, b, eps = 1e-5) =>
	assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
test("intro lands on responsive framing without changing the authored flight", () => {
	const config = routes["/"],
		original = structuredClone(config);
	for (const aspect of [1440 / 900, 390 / 844]) {
		const sequence = frameIntroSequence(config.intro, config.orbit, aspect);
		assert.deepEqual(sequence.slice(0, -1), config.intro.slice(0, -1));
		const endpoint = sequence.at(-1),
			authored = config.intro.at(-1);
		assert.deepEqual({ ...endpoint, forward: authored.forward }, authored);
		const direction = config.orbit.lookTarget.map(
			(v, i) => v - endpoint.position[i],
		);
		const yaw =
			Math.atan2(direction[0], direction[2]) +
			Math.atan(
				config.orbit.framingTarget[0] *
					Math.min(1, Math.max(0.35, aspect / 1.5)) *
					Math.tan(Math.PI / 6),
			);
		close(Math.atan2(endpoint.forward[0], endpoint.forward[2]), yaw);
		assert.notDeepEqual(endpoint.forward, authored.forward);
		const controller = new BlackHoleOrbitController(
			endpoint,
			config.orbit,
			aspect,
		);
		controller.join(config.orbit, aspect, 2);
		const output = frame();
		for (let i = 0; i < 180; i++) {
			controller.update(1 / 60, aspect, false, output);
			const dot = endpoint.forward.reduce(
				(sum, v, j) => sum + v * output.forward[j],
				0,
			);
			assert.ok(
				Math.acos(Math.min(1, dot)) < Math.PI / 180,
				"handoff must not reframe the camera",
			);
		}
	}
	assert.deepEqual(config, original);
});

test("orbit pose and derivatives close across the loop seam", () => {
	const a = createMotion(),
		b = createMotion();
	sampleOrbit(a, orbit, 0.4, 1.7);
	sampleOrbit(b, orbit, 0.4 + Math.PI * 2, 1.7);
	for (const field of ["pose", "velocity", "acceleration"])
		a[field].forEach((v, i) => {
			close(v, b[field][i]);
		});
});
test("quintic bridge preserves endpoint position, velocity and acceleration", () => {
	const a = createMotion(),
		b = createMotion(),
		out = createMotion();
	sampleOrbit(a, orbit, 0.4, 1.7);
	sampleOrbit(b, orbit, 1, 1.7);
	const bridge = createBridge(a, b, 3);
	for (const [time, expected] of [
		[0, a],
		[3, b],
	]) {
		sampleBridge(out, bridge, time);
		for (const key of ["pose", "velocity", "acceleration"])
			out[key].forEach((v, i) => {
				close(v, expected[key][i]);
			});
	}
});
test("nearest phase selects the current point rather than a fixed start", () => {
	for (const phase of [0.2, 1.8, 3.4, 5.9]) {
		const a = createMotion();
		sampleOrbit(a, orbit, phase, 1.7);
		close(nearestOrbitPhase(a, orbit, 1.7), phase, 0.001);
	}
});
test("rapid retargeting starts from the displayed motion without resetting derivatives", () => {
	const controller = new BlackHoleOrbitController(frame(), orbit, 1.7);
	controller.join(orbit);
	const output = frame();
	controller.update(0.8, 1.7, false, output);
	const before = structuredClone(controller.motion);
	controller.join({ ...orbit, anchor: [24, 8, 15] });
	controller.update(0, 1.7, false, output);
	for (const key of ["pose", "velocity", "acceleration"])
		before[key].forEach((v, i) => {
			close(v, controller.motion[key][i]);
		});
});
test("bridge joins the moving destination without a velocity or acceleration seam", () => {
	const controller = new BlackHoleOrbitController(frame(), orbit, 1.7);
	controller.join(orbit, 1.7, 3);
	const out = frame();
	controller.update(3 - 1e-6, 1.7, false, out);
	const before = structuredClone(controller.motion);
	controller.update(1e-6, 1.7, false, out);
	for (const key of ["pose", "velocity", "acceleration"])
		before[key].forEach((v, i) => {
			close(v, controller.motion[key][i], 0.001);
		});
	assert.equal(controller.transitioning, false);
});
test("long-running motion stays finite and unit length across resize and reduced motion", () => {
	const controller = new BlackHoleOrbitController(frame(), orbit, 1.7);
	controller.join(orbit);
	const out = frame();
	for (let i = 0; i < 10000; i++) {
		controller.update(
			1 / 60,
			i < 4000 ? 1.7 : 0.46,
			i >= 6000 && i < 7000,
			out,
		);
		for (const v of [...out.position, ...out.forward])
			assert.ok(Number.isFinite(v));
		close(Math.hypot(...out.forward), 1);
	}
	controller.update(0.1, 0.46, true, out);
	const fixed = structuredClone(out);
	controller.update(5, 0.46, true, out);
	assert.deepEqual(out, fixed);
});
test("session variation is deterministic, small, and does not mutate configuration", () => {
	assert.deepEqual(varyOrbit(orbit, 0.4), varyOrbit(orbit, 0.4));
	assert.notDeepEqual(varyOrbit(orbit, 0.4), varyOrbit(orbit, 0.8));
	close(orbit.period, 140);
	assert.equal(varyOrbit(orbit, 0.4).period, orbit.period);
	assert.deepEqual(varyOrbit(orbit, 0.4).anchor, orbit.anchor);
});

test("every page stays within a tiny local loop, with slow motion and no vertical bob", () => {
	for (const { orbit } of Object.values(routes)) {
		const state = createMotion(),
			out = frame();
		let previous;
		for (let i = 0; i <= 360; i++) {
			sampleOrbit(state, orbit, (i * Math.PI) / 180, 1.5);
			writeMotionFrame(state, out);
			const distance = Math.hypot(
				...out.position.map((v, j) => v - orbit.anchor[j]),
			);
			assert.ok(distance < Math.hypot(...orbit.anchor) * 0.012);
			const elevation = Math.atan2(
				out.position[1],
				Math.hypot(out.position[0], out.position[2]),
			);
			close(
				elevation,
				Math.atan2(
					orbit.anchor[1],
					Math.hypot(orbit.anchor[0], orbit.anchor[2]),
				),
				0.0001,
			);
			if (previous)
				assert.ok(
					Math.hypot(...out.position.map((v, j) => v - previous[j])) /
						(orbit.period / 360) <
						0.025,
				);
			previous = [...out.position];
		}
	}
});
test("direct entries start at the selected close-up without a pullback", () => {
	for (const { orbit } of Object.values(routes))
		for (const aspect of [0.46, 1.78]) {
			const initial = createOrbitFrame(orbit, aspect),
				controller = new BlackHoleOrbitController(initial, orbit, aspect),
				out = frame();
			controller.update(0, aspect, false, out);
			initial.position.forEach((v, i) => {
				close(v, out.position[i]);
			});
			initial.forward.forEach((v, i) => {
				close(v, out.forward[i]);
			});
			assert.ok(
				Math.hypot(...initial.position.map((v, i) => v - orbit.anchor[i])) <
					orbit.driftRadius * 1.05,
			);
		}
});
test("all route pairs travel outside the black hole and arrive at their own anchor", () => {
	for (const source of Object.values(routes))
		for (const target of Object.values(routes)) {
			const c = new BlackHoleOrbitController(
					createOrbitFrame(source.orbit, 1.5),
					source.orbit,
					1.5,
				),
				out = frame();
			c.join(target.orbit);
			for (let i = 0; i < 600; i++) {
				c.update(1 / 60, 1.5, false, out);
				assert.ok(Math.hypot(...out.position) > horizonClearance);
			}
			assert.ok(
				Math.hypot(...out.position.map((v, i) => v - target.orbit.anchor[i])) <
					0.4,
			);
		}
});
test("repeated interrupted transitions stay safely away from the center", () => {
	const configs = Object.values(routes),
		out = frame(),
		c = new BlackHoleOrbitController(createOrbitFrame(orbit, 1.5), orbit, 1.5);
	for (let i = 0; i < 120; i++) {
		c.join(configs[(i * 7) % configs.length].orbit);
		for (let j = 0; j < 30; j++) {
			c.update(1 / 60, 1.5, false, out);
			assert.ok(Math.hypot(...out.position) > horizonClearance);
		}
	}
});
test("azimuth crossing the seam takes the short path", () => {
	const a = createMotion(),
		b = createMotion(),
		out = createMotion();
	a.pose[1] = Math.PI - 0.01;
	b.pose[1] = -Math.PI + 0.01;
	sampleBridge(out, createBridge(a, b, 2), 1);
	close(out.pose[1], Math.PI);
});

test("below-disk approaches cross the plane inside the disk inner edge", () => {
	for (const [from, to] of [
		["/", "/404"],
		["/404", "/"],
		["/blog", "/404"],
		["/404", "/blog"],
	]) {
		const c = new BlackHoleOrbitController(
				createOrbitFrame(routes[from].orbit, 1.5),
				routes[from].orbit,
				1.5,
			),
			out = frame();
		let previous = createOrbitFrame(routes[from].orbit, 1.5).position;
		c.join(routes[to].orbit);
		for (let i = 0; i < 600; i++) {
			c.update(1 / 60, 1.5, false, out);
			if (previous[1] * out.position[1] < 0)
				assert.ok(Math.hypot(out.position[0], out.position[2]) < 1.8);
			previous = [...out.position];
		}
	}
});

test("interrupted below-disk departure retains its inner-gap waypoint", () => {
	const below = routes["/404"].orbit,
		c = new BlackHoleOrbitController(createOrbitFrame(below, 1.5), below, 1.5),
		out = frame();
	c.join(routes["/"].orbit);
	c.update(0.4, 1.5, false, out);
	c.join(routes["/blog"].orbit);
	let previous = [...out.position];
	for (let i = 0; i < 600; i++) {
		c.update(1 / 60, 1.5, false, out);
		if (previous[1] * out.position[1] < 0)
			assert.ok(Math.hypot(out.position[0], out.position[2]) < 1.8);
		previous = [...out.position];
	}
});

test("heading drift stays centered, bounded and slow over every page loop", () => {
	for (const { orbit } of Object.values(routes)) {
		const moving = createMotion(),
			fixed = createMotion();
		const sums = [0, 0];
		for (let i = 0; i < 360; i++) {
			const phase = (i * Math.PI) / 180;
			sampleOrbit(moving, orbit, phase, 1.5);
			sampleOrbit(fixed, orbit, phase, 1.5, false);
			for (const [axis, amplitude] of [
				[3, orbit.yawAmplitude],
				[4, orbit.pitchAmplitude],
			]) {
				const limit = (amplitude * Math.PI) / 180;
				const offset = moving.pose[axis] - fixed.pose[axis];
				assert.ok(Math.abs(offset) <= limit + 1e-12);
				assert.ok(
					Math.abs(moving.velocity[axis] - fixed.velocity[axis]) <=
						(limit * 2 * Math.PI) / orbit.period + 1e-9,
				);
				sums[axis - 3] += offset;
			}
		}
		sums.forEach((sum) => {
			close(sum, 0, 1e-10);
		});
		const legacy = {
			...orbit,
			yawAmplitude: undefined,
			pitchAmplitude: undefined,
		};
		sampleOrbit(moving, legacy, 1.2, 1.5);
		sampleOrbit(fixed, orbit, 1.2, 1.5, false);
		assert.deepEqual(moving, fixed);
	}
});

test("reduced motion removes heading drift, including after navigation", () => {
	const c = new BlackHoleOrbitController(frame(), orbit, 1.5),
		out = frame(),
		expected = createMotion();
	c.join(routes["/socials"].orbit);
	c.update(1, 1.5, true, out);
	sampleOrbit(expected, routes["/socials"].orbit, 0.45, 1.5, false);
	c.motion.pose.forEach((v, i) => {
		close(v, expected.pose[i]);
	});
	const fixed = structuredClone(out);
	c.update(160, 1.5, true, out);
	assert.deepEqual(out, fixed);
});
