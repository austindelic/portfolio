import type {
	BlackHoleAnimationKeyframe,
	BlackHoleOrbit,
} from "../config/black-hole-animation";

const TAU = Math.PI * 2;
const FOV = Math.tan(Math.PI / 6);
const unwrap = (angle: number, reference: number) =>
	reference +
	Math.atan2(Math.sin(angle - reference), Math.cos(angle - reference));
export const createMotion = () => ({
	pose: new Float64Array(5),
	velocity: new Float64Array(5),
	acceleration: new Float64Array(5),
});
export type OrbitMotion = ReturnType<typeof createMotion>;

/** Log radius, azimuth, elevation, and aim offsets. Spherical bridges travel
 * around the black hole; interpolating log radius cannot cross the origin. */
export function motionFromFrame(
	frame: BlackHoleAnimationKeyframe,
): OrbitMotion {
	const state = createMotion();
	const [x, y, z] = frame.position;
	const radius = Math.max(1e-6, Math.hypot(x, y, z));
	const azimuth = Math.atan2(x, z),
		elevation = Math.atan2(y, Math.hypot(x, z));
	state.pose.set([
		Math.log(radius),
		azimuth,
		elevation,
		unwrap(Math.atan2(frame.forward[0], frame.forward[2]), azimuth + Math.PI) -
			azimuth -
			Math.PI,
		Math.atan2(
			frame.forward[1],
			Math.hypot(frame.forward[0], frame.forward[2]),
		) + elevation,
	]);
	return state;
}

export function varyOrbit(
	config: BlackHoleOrbit,
	seed: number,
): BlackHoleOrbit {
	return { ...config, phaseOffset: seed * TAU };
}

function orbitPose(
	out: Float64Array,
	orbit: BlackHoleOrbit,
	phase: number,
	aspect: number,
	rotate: boolean,
) {
	phase += orbit.phaseOffset ?? 0;
	const [ax, ay, az] = orbit.anchor;
	const horizontalDistance = Math.hypot(ax, az);
	// A tiny horizontal loop near the authored anchor; no extra vertical bobbing.
	const x =
		ax + (orbit.driftRadius * Math.cos(phase) * az) / horizontalDistance;
	const z =
		az - (orbit.driftRadius * Math.cos(phase) * ax) / horizontalDistance;
	const y = ay;
	const scale = 1; // Close-up distance is authored, independent of viewport shape.
	const radialDrift =
		1 + (orbit.driftRadius * Math.sin(phase)) / Math.hypot(ax, ay, az);
	const px = x * scale * radialDrift,
		py = y * scale * radialDrift,
		pz = z * scale * radialDrift;
	const radius = Math.hypot(px, py, pz),
		azimuth = Math.atan2(px, pz),
		elevation = Math.atan2(py, Math.hypot(px, pz));
	const dx = orbit.lookTarget[0] - px,
		dy = orbit.lookTarget[1] - py,
		dz = orbit.lookTarget[2] - pz;
	const horizontal =
		orbit.framingTarget[0] * Math.min(1, Math.max(0.35, aspect / 1.5));
	out[0] = Math.log(radius);
	out[1] = azimuth;
	out[2] = elevation;
	out[3] =
		unwrap(Math.atan2(dx, dz), azimuth + Math.PI) -
		azimuth -
		Math.PI +
		Math.atan(horizontal * FOV) +
		(rotate
			? (((orbit.yawAmplitude ?? 0) * Math.PI) / 180) * Math.sin(phase)
			: 0);
	out[4] =
		Math.atan2(dy, Math.hypot(dx, dz)) +
		elevation -
		Math.atan((orbit.framingTarget[1] * FOV) / aspect) +
		(rotate
			? (((orbit.pitchAmplitude ?? 0) * Math.PI) / 180) * Math.cos(phase)
			: 0);
}

export function writeMotionFrame(
	motion: OrbitMotion,
	frame: BlackHoleAnimationKeyframe,
) {
	const [logRadius, azimuth, elevation, yawOffset, pitchOffset] = motion.pose;
	const radius = Math.exp(logRadius),
		horizontal = radius * Math.cos(elevation);
	frame.position[0] = horizontal * Math.sin(azimuth);
	frame.position[1] = radius * Math.sin(elevation);
	frame.position[2] = horizontal * Math.cos(azimuth);
	const yaw = azimuth + Math.PI + yawOffset,
		pitch = -elevation + pitchOffset,
		cp = Math.cos(pitch);
	frame.forward[0] = Math.sin(yaw) * cp;
	frame.forward[1] = Math.sin(pitch);
	frame.forward[2] = Math.cos(yaw) * cp;
}

export function createOrbitFrame(
	orbit: BlackHoleOrbit,
	aspect: number,
): BlackHoleAnimationKeyframe {
	const motion = createMotion();
	sampleOrbit(motion, orbit, 0, aspect);
	const frame: BlackHoleAnimationKeyframe = {
		position: [0, 0, 0],
		forward: [0, 0, -1],
		universeSign: 1,
		duration: 0,
	};
	writeMotionFrame(motion, frame);
	return frame;
}

/** Preserve the authored flight while landing on the responsive orbit heading. */
export function frameIntroSequence(
	sequence: BlackHoleAnimationKeyframe[],
	orbit: BlackHoleOrbit,
	aspect: number,
): BlackHoleAnimationKeyframe[] {
	return sequence.map((frame, index) =>
		index === sequence.length - 1 && index > 0
			? {
					...frame,
					forward: createOrbitFrame(
						{
							...orbit,
							anchor: frame.position,
							driftRadius: 0,
							yawAmplitude: 0,
							pitchAmplitude: 0,
						},
						aspect,
					).forward,
				}
			: frame,
	);
}

const before = new Float64Array(5),
	after = new Float64Array(5);
export function sampleOrbit(
	out: OrbitMotion,
	orbit: BlackHoleOrbit,
	phase: number,
	aspect: number,
	rotate = true,
) {
	const step = 0.001,
		omega = TAU / orbit.period;
	orbitPose(out.pose, orbit, phase, aspect, rotate);
	orbitPose(before, orbit, phase - step * omega, aspect, rotate);
	orbitPose(after, orbit, phase + step * omega, aspect, rotate);
	before[1] = unwrap(before[1], out.pose[1]);
	after[1] = unwrap(after[1], out.pose[1]);
	for (let i = 0; i < 5; i++) {
		out.velocity[i] = (after[i] - before[i]) / (2 * step);
		out.acceleration[i] =
			(after[i] - 2 * out.pose[i] + before[i]) / (step * step);
	}
}

export function nearestOrbitPhase(
	current: OrbitMotion,
	orbit: BlackHoleOrbit,
	aspect: number,
): number {
	const candidate = createMotion();
	const cost = (phase: number) => {
		sampleOrbit(candidate, orbit, phase, aspect);
		let score = 0;
		for (let i = 0; i < 5; i++) {
			const difference =
				i === 1
					? unwrap(candidate.pose[i], current.pose[i]) - current.pose[i]
					: candidate.pose[i] - current.pose[i];
			score += difference * difference * (i < 3 ? 625 : 64);
		}
		return score;
	};
	let best = 0,
		bestCost = Infinity;
	const step = TAU / 96;
	for (let i = 0; i < 96; i++) {
		const score = cost(i * step);
		if (score < bestCost) {
			best = i * step;
			bestCost = score;
		}
	}
	let lo = best - step,
		hi = best + step;
	for (let i = 0; i < 20; i++) {
		const a = lo + (hi - lo) / 3,
			b = hi - (hi - lo) / 3;
		if (cost(a) < cost(b)) hi = b;
		else lo = a;
	}
	return (lo + hi) / 2;
}

/** Quintic Hermite bridge: position, velocity and acceleration agree at both ends. */
export function createBridge(
	from: OrbitMotion,
	to: OrbitMotion,
	duration: number,
) {
	const coefficients = new Float64Array(30);
	for (let i = 0; i < 5; i++) {
		const p = from.pose[i],
			v = from.velocity[i] * duration,
			a = from.acceleration[i] * duration * duration;
		const target = i === 1 || i === 3 ? unwrap(to.pose[i], p) : to.pose[i];
		const d = target - p - v - a / 2;
		const dv = to.velocity[i] * duration - v - a;
		const da = to.acceleration[i] * duration * duration - a;
		coefficients.set(
			[
				p,
				v,
				a / 2,
				10 * d - 4 * dv + da / 2,
				-15 * d + 7 * dv - da,
				6 * d - 3 * dv + da / 2,
			],
			i * 6,
		);
	}
	return { coefficients, duration };
}
export function sampleBridge(
	out: OrbitMotion,
	bridge: ReturnType<typeof createBridge>,
	elapsed: number,
) {
	const t = Math.max(0, Math.min(1, elapsed / bridge.duration)),
		c = bridge.coefficients;
	for (let i = 0; i < 5; i++) {
		const j = i * 6;
		out.pose[i] =
			c[j] +
			t *
				(c[j + 1] +
					t * (c[j + 2] + t * (c[j + 3] + t * (c[j + 4] + t * c[j + 5]))));
		out.velocity[i] =
			(c[j + 1] +
				t *
					(2 * c[j + 2] +
						t * (3 * c[j + 3] + t * (4 * c[j + 4] + t * 5 * c[j + 5])))) /
			bridge.duration;
		out.acceleration[i] =
			(2 * c[j + 2] +
				t * (6 * c[j + 3] + t * (12 * c[j + 4] + t * 20 * c[j + 5]))) /
			(bridge.duration * bridge.duration);
	}
}

export class BlackHoleOrbitController {
	readonly motion: OrbitMotion;
	private orbit: BlackHoleOrbit;
	private phase = 0;
	private aspect: number;
	private bridge: ReturnType<typeof createBridge> | null = null;
	private elapsed = 0;
	private destination = createMotion();
	private reduced = false;
	private pendingOrbit: BlackHoleOrbit | null = null;
	private diskApproach: BlackHoleOrbit["approach"];
	constructor(
		frame: BlackHoleAnimationKeyframe,
		orbit: BlackHoleOrbit,
		aspect: number,
	) {
		this.motion = motionFromFrame(frame);
		this.orbit = orbit;
		this.diskApproach = orbit.approach;
		this.aspect = aspect;
	}
	get transitioning() {
		return this.bridge !== null;
	}
	join(
		orbit: BlackHoleOrbit,
		aspect = this.aspect,
		duration?: number,
		skipApproach = false,
	) {
		const approach = orbit.approach ?? this.orbit.approach ?? this.diskApproach;
		this.diskApproach = approach;
		const crossingDisk = this.motion.pose[2] * orbit.anchor[1] < 0;
		this.pendingOrbit = null;
		this.orbit = orbit;
		this.aspect = Math.max(0.2, aspect);
		if (!skipApproach && crossingDisk && approach) {
			const waypoint = motionFromFrame(
				createOrbitFrame(
					{ ...orbit, anchor: approach, driftRadius: 0 },
					this.aspect,
				),
			);
			this.bridge = createBridge(this.motion, waypoint, 4);
			this.pendingOrbit = orbit;
			this.elapsed = 0;
			return;
		}
		this.phase = nearestOrbitPhase(this.motion, orbit, this.aspect);
		sampleOrbit(this.destination, orbit, this.phase, this.aspect);
		const angularDistance = Math.hypot(
			unwrap(this.destination.pose[1], this.motion.pose[1]) -
				this.motion.pose[1],
			this.destination.pose[2] - this.motion.pose[2],
		);
		const seconds = duration ?? Math.min(8, 4 + angularDistance * 2);

		// Join the moving orbit where it will be at the end of the bridge.
		sampleOrbit(
			this.destination,
			orbit,
			this.phase + (seconds * TAU) / orbit.period,
			this.aspect,
		);
		this.bridge = createBridge(this.motion, this.destination, seconds);
		this.elapsed = 0;
	}
	update(
		delta: number,
		aspect: number,
		reduced: boolean,
		frame: BlackHoleAnimationKeyframe,
	) {
		if (reduced) {
			this.phase = 0.45;
			this.bridge = null;
			this.pendingOrbit = null;
			sampleOrbit(
				this.motion,
				this.orbit,
				this.phase,
				Math.max(0.2, aspect),
				false,
			);
			this.motion.velocity.fill(0);
			this.motion.acceleration.fill(0);
		} else {
			// A fresh bridge gives viewport changes the same continuity as navigation.
			if (this.reduced || Math.abs(Math.log(aspect / this.aspect)) > 0.02)
				this.join(this.orbit, aspect);
			this.phase += (delta * TAU) / this.orbit.period;
			if (this.bridge) {
				this.elapsed += delta;
				if (this.elapsed < this.bridge.duration)
					sampleBridge(this.motion, this.bridge, this.elapsed);
				else {
					if (this.pendingOrbit) {
						const next = this.pendingOrbit,
							remainder = this.elapsed - this.bridge.duration;
						sampleBridge(this.motion, this.bridge, this.bridge.duration);
						this.join(next, this.aspect, 4, true);
						this.update(remainder, aspect, reduced, frame);
						return;
					}
					this.bridge = null;
					sampleOrbit(this.motion, this.orbit, this.phase, this.aspect);
				}
			} else sampleOrbit(this.motion, this.orbit, this.phase, this.aspect);
		}
		this.reduced = reduced;
		writeMotionFrame(this.motion, frame);
	}
}
