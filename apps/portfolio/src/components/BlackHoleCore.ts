import {
	type BlackHoleAnimationKeyframe,
	type BlackHoleAnimationRouteKey,
	getBlackHoleRouteAnimation,
} from "../config/black-hole-animation";
import { glyphDirection, rankGlyphs } from "../lib/ascii-analysis";
export type Vec3 = [number, number, number];

export type AsciiCellSize = {
	x: number;
	y: number;
};

export type GlyphPreset = "gargantua" | "classic" | "dense" | "custom";
export type PaletteMode = "source" | "custom";
export type QualityPreset =
	| "cinematic-ascii"
	| "mobile-safe"
	| "ascii-balanced"
	| "ascii-sharp"
	| "performance"
	| "balanced"
	| "visual"
	| "desktop-full"
	| "stress-test"
	| "custom";
export type QualityProp = Exclude<QualityPreset, "custom"> | number;
export type AnimationMode = "off" | "route" | "editor";
export type AnimationPhase = "off" | "intro" | "transition" | "idle";
export type RendererMode = "auto" | "full" | "ascii-cell" | "fallback-full";
export type ResolvedRendererMode = "full" | "ascii-cell";
export type ShaderBackend = "auto" | "webgl2" | "webgpu";
export type ResolvedShaderBackend = "webgl2" | "webgpu";
export type RuntimeProfile = "desktop" | "mobile" | "lowPower";
export type FontFamily =
	| "Departure Mono"
	| "DSEG14Modern"
	| "Menlo"
	| "Courier New"
	| "monospace";

export type ShaderControls = {
	timeScale: number;
	exposure: number;
	bloomStrength: number;
	temporalJitter: number;
	invertControls: boolean;
	paletteMode: PaletteMode;
	shadowColor: string;
	midColor: string;
	highlightColor: string;
	glyphPreset: GlyphPreset;
	customGlyphs: string;
	fontFamily: FontFamily;
	textSize: number;
	brightness: number;
	contrast: number;
};

export type RenderSettings = {
	asciiEnabled: boolean;
	qualityPreset: QualityPreset;
	qualityValue: number;
	maxDevicePixelRatio: number;
	sceneScale: number;
	prepassScale: number;
	bloomScale: number;
	resolutionScale: number;
	cellWidth: number;
	cellHeight: number;
	frameIntervalMs: number;
	enableBloomPass: boolean;
};

export type GlyphAtlasConfig = {
	glyphs: string;
	glyphCount: number;
	fontFamily: FontFamily;
	textSize: number;
	cellSize: AsciiCellSize;
	key: string;
};

export type GlyphAtlasRaster = {
	canvas: HTMLCanvasElement;
	metricsCanvas: HTMLCanvasElement;
};

export type GlyphTextureSet = {
	atlas: TextureLike;
	metrics: TextureLike;
	dispose: () => void;
};

export type RenderUniforms = {
	asciiCellSize: AsciiCellSize;
	asciiMix: number;
	glyphCount: number;
	temporalJitter: number;
	exposure: number;
	bloomStrength: number;
	asciiBrightness: number;
	asciiContrast: number;
	paletteMode: number;
	shadowColor: Vec3;
	midColor: Vec3;
	highlightColor: Vec3;
};

export type TextureLike = {
	texture: WebGLTexture;
	width: number;
	height: number;
};

export type RenderTarget = TextureLike & {
	framebuffer: WebGLFramebuffer;
};

export type MultiRenderTarget = {
	framebuffer: WebGLFramebuffer;
	textures: TextureLike[];
	width: number;
	height: number;
	dispose: () => void;
};

export type PingPongTarget = {
	read: RenderTarget;
	write: RenderTarget;
	swap: () => void;
	dispose: () => void;
};

export type TextureFormat = {
	internalFormat: number;
	format: number;
	type: number;
	canFilterLinear: boolean;
};

type AsciiAnalysisTargets = {
	pass: ProgramPass;
	read: MultiRenderTarget;
	write: MultiRenderTarget;
	key: string;
	atlas: WebGLTexture;
	frame: number;
};
export type ProgramPass = {
	analysis?: AsciiAnalysisTargets;
	channels: TextureLike[];
	vao: WebGLVertexArrayObject | null;
	uniformCache: Map<WebGLUniformLocation, Array<number | undefined>>;
	name: string;
	program: WebGLProgram;
	locations: {
		position: number;
		iResolution: WebGLUniformLocation | null;
		iTime: WebGLUniformLocation | null;
		iTimeDelta: WebGLUniformLocation | null;
		iFrame: WebGLUniformLocation | null;
		iMouse: WebGLUniformLocation | null;
		iChannelResolution: WebGLUniformLocation | null;
		iChannels: Array<WebGLUniformLocation | null>;
		uCameraPosition: WebGLUniformLocation | null;
		uCameraRight: WebGLUniformLocation | null;
		uCameraUp: WebGLUniformLocation | null;
		uUniverseSign: WebGLUniformLocation | null;
		uQuality: WebGLUniformLocation | null;
		uTemporalJitter: WebGLUniformLocation | null;
		uBlendWeight: WebGLUniformLocation | null;
		uBloomMode: WebGLUniformLocation | null;
		uCanvasResolution: WebGLUniformLocation | null;
		uAsciiCellSize: WebGLUniformLocation | null;
		uAsciiMix: WebGLUniformLocation | null;
		uGlyphCount: WebGLUniformLocation | null;
		uAsciiBrightness: WebGLUniformLocation | null;
		uAsciiContrast: WebGLUniformLocation | null;
		uPaletteMode: WebGLUniformLocation | null;
		uShadowColor: WebGLUniformLocation | null;
		uMidColor: WebGLUniformLocation | null;
		uHighlightColor: WebGLUniformLocation | null;
		uExposure: WebGLUniformLocation | null;
		uBloomStrength: WebGLUniformLocation | null;
		uAsciiAnalysisColor: WebGLUniformLocation | null;
		uAsciiAnalysisState: WebGLUniformLocation | null;
	};
};

export type FallbackPassSet = {
	a: ProgramPass;
	b?: ProgramPass;
	c?: ProgramPass;
	d?: ProgramPass;
	image: ProgramPass;
	ascii: ProgramPass;
};

export type FallbackTargets = {
	a: PingPongTarget;
	b?: RenderTarget;
	c?: RenderTarget;
	d?: RenderTarget;
	scene: RenderTarget;
};

export type CameraState = {
	asciiHistoryVersion?: number;
	position: Vec3;
	right: Vec3;
	up: Vec3;
	forward: Vec3;
	universeSign: number;
	pendingYaw: number;
	pendingPitch: number;
};

export type BlackHoleStats = {
	mode: "optimized" | "fallback" | "ascii-cell" | "webgpu";
	backend: ResolvedShaderBackend;
	requestedBackend?: ShaderBackend;
	requestedRendererMode: RendererMode;
	runtimeProfile: RuntimeProfile;
	frame: number;
	frameTimeMs: number;
	cpuAverageFrameTimeMs: number;
	averageFrameTimeMs: number;
	fps: number;
	reactRenderCount: number;
	dpr: number;
	targetAllocationScale: number;
	prepassScale: number;
	bloomScale: number;
	sceneScale: number;
	asciiEnabled: boolean;
	asciiCellSize: AsciiCellSize;
	renderWidth: number;
	renderHeight: number;
	sceneWidth: number;
	sceneHeight: number;
	prepassWidth: number;
	prepassHeight: number;
	bloomWidth: number;
	bloomHeight: number;
	cameraPosition: Vec3;
	cameraForward: Vec3;
	universeSign: number;
	movementSpeed: number;
	timeScale: number;
	exposure: number;
	bloomStrength: number;
	temporalJitter: number;
	invertControls: boolean;
	paletteMode: PaletteMode;
	glyphCount: number;
	fontFamily: FontFamily;
	textSize: number;
	asciiBrightness: number;
	asciiContrast: number;
	shaderTime: number;
	qualityPreset: QualityPreset;
	qualityValue: number;
	maxDevicePixelRatio: number;
	resolutionScale: number;
	cellWidth: number;
	cellHeight: number;
	cellCount: number;
	computeWorkgroups: number;
	computeInvocations: number;
	frameIntervalMs: number;
	enableBloomPass: boolean;
	passCount: number;
	estimatedTextureMemoryBytes: number;
	initTimeMs: number;
	gpuFrameTimeMs: number | null;
	gpuTimingSupported: boolean;
	webgpuAvailable: boolean;
	fallbackReason: string | null;
	lastAllocationFailure: string | null;
	animationMode: AnimationMode;
	animationRoute: BlackHoleAnimationRouteKey;
	animationPhase: AnimationPhase;
	animationPlaying: boolean;
	animationFrameIndex: number;
	animationSequenceTime: number;
};

export type Props = {
	className?: string;
	showControls?: boolean;
	interactive?: boolean;
	idleRenderIntervalMs?: number;
	forceActiveRender?: boolean;
	rendererMode?: RendererMode;
	backend?: ShaderBackend;
	quality?: QualityProp;
	resolutionScale?: number;
	prepassScale?: number;
	bloomScale?: number;
	maxDevicePixelRatio?: number;
	cellWidth?: number;
	cellHeight?: number;
	frameIntervalMs?: number;
	enableBloomPass?: boolean;
	initialCameraPosition?: Vec3;
	initialCameraForward?: Vec3;
	initialUniverseSign?: number;
	asciiEnabled?: boolean;
	asciiCellSize?: AsciiCellSize;
	asciiMix?: number;
	sceneScale?: number;
	timeScale?: number;
	exposure?: number;
	bloomStrength?: number;
	temporalJitter?: number;
	invertControls?: boolean;
	paletteMode?: PaletteMode;
	shadowColor?: string;
	midColor?: string;
	highlightColor?: string;
	glyphPreset?: GlyphPreset;
	customGlyphs?: string;
	fontFamily?: FontFamily;
	textSize?: number;
	brightness?: number;
	contrast?: number;
	animationMode?: AnimationMode;
	animationRoute?: string;
	animationAutoplay?: boolean;
	debugStats?: boolean;
};

export type RuntimeSnapshot = {
	cameraPosition?: Vec3;
	cameraForward?: Vec3;
	universeSign?: number;
	shaderTime?: number;
	movementSpeed?: number;
};

export type PersistentAnimationSnapshot = Required<RuntimeSnapshot> & {
	route: BlackHoleAnimationRouteKey;
};

export type BenchmarkResult = {
	label: string;
	rendererMode: RendererMode;
	backend: ShaderBackend;
	activeMode: BlackHoleStats["mode"] | "unavailable";
	activeBackend: ResolvedShaderBackend | "unavailable";
	averageFps: number;
	averageFrameTimeMs: number;
	p95FrameTimeMs: number;
	cpuAverageFrameTimeMs: number;
	cpuP95FrameTimeMs: number;
	initTimeMs: number;
	cellCount: number;
	passCount: number;
	renderTargetPixels: number;
	computeWorkgroups: number;
	computeInvocations: number;
	estimatedTextureMemoryBytes: number;
	gpuFrameTimeMs: number | null;
	gpuTimingSupported: boolean;
	fallbackReason: string | null;
};

export type CameraEditorApi = {
	applyPosition: (value: string) => boolean;
	applyForward: (value: string) => boolean;
	applyUniverse: (value: string) => boolean;
	sync: () => void;
};

export type AnimationEditorApi = {
	play: () => void;
	pause: () => void;
	restartIntro: () => void;
	previewIdle: () => void;
	setRoute: (route: BlackHoleAnimationRouteKey) => void;
	currentKeyframe: () => string;
	routeConfig: () => string;
};

declare global {
	interface Window {
		__blackHoleStats?: BlackHoleStats;
		__blackHoleBenchmark?: BenchmarkResult[];
		__blackHoleAnimationSnapshot?: PersistentAnimationSnapshot;
	}
}

export const CONTROL_KEY_CODES = new Set([65, 68, 69, 70, 81, 82, 83, 87]);

export const MOVE_SPEED = 2.5;
export const MOVE_SPEED_FACTOR = 1.25;
export const MOUSE_SENSITIVITY = 0.003;
export const ROLL_SPEED = 2.0;

export const MIN_RENDER_SCALE = 0.01;
export const MIN_DPR = 0.01;
export const MIN_TEXT_SIZE = 1;
export const MIN_QUALITY_VALUE = 0.01;
export const MAX_GLYPH_ATLAS_DIMENSION = 4096;
export const MIN_PREPASS_SCALE = MIN_RENDER_SCALE;
export const DIRECT_FALLBACK_DPR = 0.85;
export const TARGET_ALLOCATION_SCALE_STEPS = [
	1, 0.75, 0.5, 0.35, 0.25,
] as const;

export const DEFAULT_ASCII_CELL_SIZE: AsciiCellSize = { x: 6, y: 9 };
export const DEFAULT_ASCII_CELL_FRAME_INTERVAL_MS = 33;
export const MAX_GLYPHS = 96;
export const GLYPH_PRESETS: Record<Exclude<GlyphPreset, "custom">, string> = {
	gargantua: " .voidCG08A/\\-|",
	classic: " .:-=+*#%@",
	dense:
		" .'`,^\":;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
};
export const FONT_OPTIONS: FontFamily[] = [
	"Departure Mono",
	"DSEG14Modern",
	"Menlo",
	"Courier New",
	"monospace",
];
export const DEFAULT_SHADER_CONTROLS: ShaderControls = {
	timeScale: 2,
	exposure: 2,
	bloomStrength: 0.65,
	temporalJitter: 0,
	invertControls: false,
	paletteMode: "source",
	shadowColor: "#08162d",
	midColor: "#35c7ff",
	highlightColor: "#fffaf2",
	glyphPreset: "gargantua",
	customGlyphs: "voidCG08AA",
	fontFamily: "Departure Mono",
	textSize: 9,
	brightness: 0,
	contrast: 1,
};
export const DEFAULT_RENDER_UNIFORMS: RenderUniforms = {
	asciiCellSize: DEFAULT_ASCII_CELL_SIZE,
	asciiMix: 1,
	glyphCount: 10,
	temporalJitter: 0,
	exposure: 2,
	bloomStrength: 0.65,
	asciiBrightness: 0,
	asciiContrast: 1,
	paletteMode: 0,
	shadowColor: [0.031, 0.086, 0.176],
	midColor: [0.207, 0.78, 1],
	highlightColor: [1, 0.98, 0.949],
};

export function glyphControlsKey(controls: ShaderControls): string {
	return [
		controls.glyphPreset,
		controls.customGlyphs,
		controls.fontFamily,
		controls.textSize,
	].join("\n");
}

export function add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(v: Vec3, s: number): Vec3 {
	return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}

export function length(v: Vec3): number {
	return Math.hypot(v[0], v[1], v[2]);
}

export function copyVec3Into(target: Vec3, source: Vec3): Vec3 {
	target[0] = source[0];
	target[1] = source[1];
	target[2] = source[2];
	return target;
}

export function cloneVec3(source: Vec3): Vec3 {
	return [source[0], source[1], source[2]];
}

export function normalizeInto(target: Vec3, source: Vec3): Vec3 {
	const magnitude = length(source);
	if (magnitude < 1e-9) {
		target[0] = 0;
		target[1] = 0;
		target[2] = 0;
		return target;
	}
	const scaleValue = 1 / magnitude;
	target[0] = source[0] * scaleValue;
	target[1] = source[1] * scaleValue;
	target[2] = source[2] * scaleValue;
	return target;
}

export function crossInto(target: Vec3, a: Vec3, b: Vec3): Vec3 {
	const x = a[1] * b[2] - a[2] * b[1];
	const y = a[2] * b[0] - a[0] * b[2];
	const z = a[0] * b[1] - a[1] * b[0];
	target[0] = x;
	target[1] = y;
	target[2] = z;
	return target;
}

export function normalize(v: Vec3): Vec3 {
	const magnitude = length(v);
	if (magnitude < 1e-9) return [0, 0, 0];
	return scale(v, 1 / magnitude);
}

export function rotateAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
	const n = normalize(axis);
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const oneMinusC = 1 - c;
	const axisDot = dot(n, v);
	const axisCross = cross(n, v);

	return [
		v[0] * c + axisCross[0] * s + n[0] * axisDot * oneMinusC,
		v[1] * c + axisCross[1] * s + n[1] * axisDot * oneMinusC,
		v[2] * c + axisCross[2] * s + n[2] * axisDot * oneMinusC,
	];
}

export function coerceVec3(value: Vec3 | undefined, fallback: Vec3): Vec3 {
	if (!value || value.some((component) => !Number.isFinite(component))) {
		return [...fallback];
	}

	return [value[0], value[1], value[2]];
}

export function createInitialCamera({
	position: initialPosition,
	forward: initialForward,
	universeSign,
}: {
	position?: Vec3;
	forward?: Vec3;
	universeSign?: number;
} = {}): CameraState {
	const position = coerceVec3(initialPosition, [-2.0, -3.6, 22.0]);
	let forward = normalize(coerceVec3(initialForward, [0.0, 0.15, -1.0]));
	if (length(forward) < 1e-9) forward = normalize([0.0, 0.15, -1.0]);
	let right = normalize(cross(forward, [-0.5, 1.0, 0.0]));
	if (length(right) < 1e-9) right = normalize(cross(forward, [0.0, 1.0, 0.0]));
	if (length(right) < 1e-9) right = normalize(cross(forward, [1.0, 0.0, 0.0]));
	const up = normalize(cross(right, forward));

	return {
		position,
		right,
		up,
		forward,
		universeSign: universeSign !== undefined && universeSign < 0 ? -1 : 1,
		pendingYaw: 0,
		pendingPitch: 0,
	};
}

export function setCameraForward(camera: CameraState, forward: Vec3) {
	normalizeInto(camera.forward, forward);
	if (length(camera.forward) < 1e-9)
		normalizeInto(camera.forward, [0, 0.15, -1]);
	crossInto(camera.right, camera.forward, [-0.5, 1, 0]);
	normalizeInto(camera.right, camera.right);
	if (length(camera.right) < 1e-9) {
		crossInto(camera.right, camera.forward, [0, 1, 0]);
		normalizeInto(camera.right, camera.right);
	}
	if (length(camera.right) < 1e-9) {
		crossInto(camera.right, camera.forward, [1, 0, 0]);
		normalizeInto(camera.right, camera.right);
	}
	crossInto(camera.up, camera.right, camera.forward);
	normalizeInto(camera.up, camera.up);
	camera.pendingYaw = 0;
	camera.pendingPitch = 0;
}

export function formatCameraNumber(value: number): string {
	const normalizedValue = Math.abs(value) < 0.0005 ? 0 : value;
	return normalizedValue.toFixed(3);
}

export function formatCameraVec3(value: Vec3): string {
	return `[${value.map(formatCameraNumber).join(", ")}]`;
}

export function parseCameraVec3(value: string): Vec3 | null {
	const matches = value.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi);
	if (!matches || matches.length !== 3) return null;

	const parsed = matches.map(Number);
	if (parsed.some((component) => !Number.isFinite(component))) return null;

	return [parsed[0], parsed[1], parsed[2]];
}

export function parseUniverseSign(value: string): number | null {
	const parsed = Number(value.trim());
	if (!Number.isFinite(parsed)) return null;
	return parsed < 0 ? -1 : 1;
}

export function cameraDefaultsKey(
	position: Vec3 | undefined,
	forward: Vec3 | undefined,
	universeSign: number | undefined,
): string {
	return [
		position?.map(String).join(",") ?? "",
		forward?.map(String).join(",") ?? "",
		universeSign ?? "",
	].join("|");
}

export function lerpNumber(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function lerpVec3Into(target: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
	target[0] = lerpNumber(a[0], b[0], t);
	target[1] = lerpNumber(a[1], b[1], t);
	target[2] = lerpNumber(a[2], b[2], t);
	return target;
}

export function catmullRomVec3Into(
	target: Vec3,
	p0: Vec3,
	p1: Vec3,
	p2: Vec3,
	p3: Vec3,
	t: number,
): Vec3 {
	const t2 = t * t;
	const t3 = t2 * t;
	target[0] =
		0.5 *
		(2 * p1[0] +
			(-p0[0] + p2[0]) * t +
			(2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
			(-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
	target[1] =
		0.5 *
		(2 * p1[1] +
			(-p0[1] + p2[1]) * t +
			(2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
			(-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
	target[2] =
		0.5 *
		(2 * p1[2] +
			(-p0[2] + p2[2]) * t +
			(2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 +
			(-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3);
	return target;
}

export function smootherStep(t: number): number {
	const x = clamp(t, 0, 1);
	return x * x * x * (x * (x * 6 - 15) + 10);
}

export function easeAnimationValue(
	t: number,
	ease: BlackHoleAnimationKeyframe["ease"],
): number {
	const x = clamp(t, 0, 1);
	if (ease === "linear") return x;
	if (ease === "smoothstep") return x * x * (3 - 2 * x);
	if (ease === "easeInOutCubic") {
		return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
	}
	return smootherStep(x);
}

export function keyframeDuration(frame: BlackHoleAnimationKeyframe): number {
	return Math.max(0.001, finiteNumber(frame.duration, 0.001));
}

export function animationLoopDuration(
	sequence: BlackHoleAnimationKeyframe[],
): number {
	if (sequence.length < 2) return 0;
	let total = keyframeDuration(sequence[0]);
	for (let index = 1; index < sequence.length; index += 1) {
		total += keyframeDuration(sequence[index]);
	}
	return total;
}

export function animationOneShotDuration(
	sequence: BlackHoleAnimationKeyframe[],
): number {
	if (sequence.length < 2) return 0;
	let total = 0;
	for (let index = 1; index < sequence.length; index += 1) {
		total += keyframeDuration(sequence[index]);
	}
	return total;
}

export function modularIndex(index: number, lengthValue: number): number {
	return ((index % lengthValue) + lengthValue) % lengthValue;
}

export function numberVisualValue(
	previous: number | undefined,
	next: number | undefined,
	fallback: number | undefined,
	t: number,
): number | undefined {
	if (previous === undefined && next === undefined) return undefined;
	const from = finiteNumber(previous ?? fallback, fallback ?? 0);
	const to = finiteNumber(next ?? previous ?? fallback, from);
	return lerpNumber(from, to, t);
}

export function discreteVisualValue<T>(
	previous: T | undefined,
	next: T | undefined,
	t: number,
): T | undefined {
	if (previous === undefined && next === undefined) return undefined;
	return t >= 0.999 ? (next ?? previous) : (previous ?? next);
}

export function interpolateAnimationSegmentInto(
	output: BlackHoleAnimationKeyframe,
	sequence: BlackHoleAnimationKeyframe[],
	targetIndex: number,
	t: number,
	loop: boolean,
	baseControls: ShaderControls,
	baseAsciiEnabled: boolean,
): BlackHoleAnimationKeyframe {
	const easedT = easeAnimationValue(t, sequence[targetIndex]?.ease);
	const lengthValue = sequence.length;
	const previousIndex = loop
		? modularIndex(targetIndex - 1, lengthValue)
		: Math.max(0, targetIndex - 1);
	const p0Index = loop
		? modularIndex(targetIndex - 2, lengthValue)
		: Math.max(0, targetIndex - 2);
	const p3Index = loop
		? modularIndex(targetIndex + 1, lengthValue)
		: Math.min(lengthValue - 1, targetIndex + 1);
	const previous = sequence[previousIndex];
	const next = sequence[targetIndex];

	if (loop || (targetIndex > 1 && targetIndex < lengthValue - 1)) {
		catmullRomVec3Into(
			output.position,
			sequence[p0Index].position,
			previous.position,
			next.position,
			sequence[p3Index].position,
			easedT,
		);
	} else {
		lerpVec3Into(output.position, previous.position, next.position, easedT);
	}

	lerpVec3Into(output.forward, previous.forward, next.forward, easedT);
	normalizeInto(output.forward, output.forward);
	if (length(output.forward) <= 1e-9) {
		normalizeInto(output.forward, next.forward);
	}

	output.duration = next.duration;
	output.universeSign =
		easedT >= 0.5 ? next.universeSign : previous.universeSign;
	output.ease = next.ease;
	output.timeScale = numberVisualValue(
		previous.timeScale,
		next.timeScale,
		baseControls.timeScale,
		easedT,
	);
	output.exposure = numberVisualValue(
		previous.exposure,
		next.exposure,
		baseControls.exposure,
		easedT,
	);
	output.bloomStrength = numberVisualValue(
		previous.bloomStrength,
		next.bloomStrength,
		baseControls.bloomStrength,
		easedT,
	);
	output.temporalJitter = numberVisualValue(
		previous.temporalJitter,
		next.temporalJitter,
		baseControls.temporalJitter,
		easedT,
	);
	output.asciiEnabled =
		discreteVisualValue(previous.asciiEnabled, next.asciiEnabled, easedT) ??
		baseAsciiEnabled;
	output.textSize = numberVisualValue(
		previous.textSize,
		next.textSize,
		baseControls.textSize,
		easedT,
	);
	output.brightness = numberVisualValue(
		previous.brightness,
		next.brightness,
		baseControls.brightness,
		easedT,
	);
	output.contrast = numberVisualValue(
		previous.contrast,
		next.contrast,
		baseControls.contrast,
		easedT,
	);
	output.glyphPreset = discreteVisualValue(
		previous.glyphPreset,
		next.glyphPreset,
		easedT,
	);
	output.customGlyphs = discreteVisualValue(
		previous.customGlyphs,
		next.customGlyphs,
		easedT,
	);
	output.paletteMode = discreteVisualValue(
		previous.paletteMode,
		next.paletteMode,
		easedT,
	);
	output.shadowColor = discreteVisualValue(
		previous.shadowColor,
		next.shadowColor,
		easedT,
	);
	output.midColor = discreteVisualValue(
		previous.midColor,
		next.midColor,
		easedT,
	);
	output.highlightColor = discreteVisualValue(
		previous.highlightColor,
		next.highlightColor,
		easedT,
	);

	return output;
}

export function copyAnimationFrameInto(
	output: BlackHoleAnimationKeyframe,
	frame: BlackHoleAnimationKeyframe,
): BlackHoleAnimationKeyframe {
	output.duration = frame.duration;
	copyVec3Into(output.position, frame.position);
	copyVec3Into(output.forward, frame.forward);
	output.universeSign = frame.universeSign;
	output.ease = frame.ease;
	output.timeScale = frame.timeScale;
	output.exposure = frame.exposure;
	output.bloomStrength = frame.bloomStrength;
	output.temporalJitter = frame.temporalJitter;
	output.asciiEnabled = frame.asciiEnabled;
	output.textSize = frame.textSize;
	output.brightness = frame.brightness;
	output.contrast = frame.contrast;
	output.glyphPreset = frame.glyphPreset;
	output.customGlyphs = frame.customGlyphs;
	output.paletteMode = frame.paletteMode;
	output.shadowColor = frame.shadowColor;
	output.midColor = frame.midColor;
	output.highlightColor = frame.highlightColor;
	return output;
}

export function evaluateAnimationSequenceInto(
	output: {
		frame: BlackHoleAnimationKeyframe | null;
		frameIndex: number;
		done: boolean;
		sequenceTime: number;
	},
	scratchFrame: BlackHoleAnimationKeyframe,
	{
		sequence,
		time,
		loop,
		baseControls,
		baseAsciiEnabled,
	}: {
		sequence: BlackHoleAnimationKeyframe[];
		time: number;
		loop: boolean;
		baseControls: ShaderControls;
		baseAsciiEnabled: boolean;
	},
) {
	if (sequence.length === 0) {
		output.frame = null;
		output.frameIndex = 0;
		output.done = true;
		output.sequenceTime = 0;
		return output;
	}
	if (sequence.length === 1) {
		output.frame = sequence[0];
		output.frameIndex = 0;
		output.done = true;
		output.sequenceTime = 0;
		return output;
	}

	if (loop) {
		const total = animationLoopDuration(sequence);
		const sequenceTime = total > 0 ? ((time % total) + total) % total : 0;
		let cursor = 0;
		for (let index = 1; index < sequence.length; index += 1) {
			const duration = keyframeDuration(sequence[index]);
			if (sequenceTime <= cursor + duration) {
				output.frame = interpolateAnimationSegmentInto(
					scratchFrame,
					sequence,
					index,
					(sequenceTime - cursor) / duration,
					true,
					baseControls,
					baseAsciiEnabled,
				);
				output.frameIndex = index;
				output.done = false;
				output.sequenceTime = sequenceTime;
				return output;
			}
			cursor += duration;
		}

		const duration = keyframeDuration(sequence[0]);
		output.frame = interpolateAnimationSegmentInto(
			scratchFrame,
			sequence,
			0,
			(sequenceTime - cursor) / duration,
			true,
			baseControls,
			baseAsciiEnabled,
		);
		output.frameIndex = 0;
		output.done = false;
		output.sequenceTime = sequenceTime;
		return output;
	}

	const total = animationOneShotDuration(sequence);
	if (time >= total) {
		output.frame = copyAnimationFrameInto(
			scratchFrame,
			sequence[sequence.length - 1],
		);
		output.frameIndex = sequence.length - 1;
		output.done = true;
		output.sequenceTime = total;
		return output;
	}

	let cursor = 0;
	for (let index = 1; index < sequence.length; index += 1) {
		const duration = keyframeDuration(sequence[index]);
		if (time <= cursor + duration) {
			output.frame = interpolateAnimationSegmentInto(
				scratchFrame,
				sequence,
				index,
				(time - cursor) / duration,
				false,
				baseControls,
				baseAsciiEnabled,
			);
			output.frameIndex = index;
			output.done = false;
			output.sequenceTime = time;
			return output;
		}
		cursor += duration;
	}

	output.frame = copyAnimationFrameInto(
		scratchFrame,
		sequence[sequence.length - 1],
	);
	output.frameIndex = sequence.length - 1;
	output.done = true;
	output.sequenceTime = total;
	return output;
}

export function writeAnimationControlsFromFrame(
	target: ShaderControls,
	baseControls: ShaderControls,
	frame: BlackHoleAnimationKeyframe | null,
): ShaderControls {
	if (!frame) {
		Object.assign(target, baseControls);
		return target;
	}

	target.timeScale = finiteNumber(frame.timeScale, baseControls.timeScale);
	target.exposure = finiteNumber(frame.exposure, baseControls.exposure);
	target.bloomStrength = finiteNumber(
		frame.bloomStrength,
		baseControls.bloomStrength,
	);
	target.temporalJitter = floorNumber(
		frame.temporalJitter ?? baseControls.temporalJitter,
		0,
		baseControls.temporalJitter,
	);
	target.invertControls = baseControls.invertControls;
	target.paletteMode = frame.paletteMode ?? baseControls.paletteMode;
	target.shadowColor = normalizeHexColor(
		frame.shadowColor ?? baseControls.shadowColor,
		baseControls.shadowColor,
	);
	target.midColor = normalizeHexColor(
		frame.midColor ?? baseControls.midColor,
		baseControls.midColor,
	);
	target.highlightColor = normalizeHexColor(
		frame.highlightColor ?? baseControls.highlightColor,
		baseControls.highlightColor,
	);
	target.glyphPreset = frame.glyphPreset ?? baseControls.glyphPreset;
	target.customGlyphs = frame.customGlyphs ?? baseControls.customGlyphs;
	target.fontFamily = baseControls.fontFamily;
	target.textSize = floorNumber(
		frame.textSize ?? baseControls.textSize,
		MIN_TEXT_SIZE,
		baseControls.textSize,
	);
	target.brightness = finiteNumber(frame.brightness, baseControls.brightness);
	target.contrast = finiteNumber(frame.contrast, baseControls.contrast);
	return target;
}

export function applyAnimationCamera(
	camera: CameraState,
	frame: BlackHoleAnimationKeyframe | null,
) {
	if (!frame) return;
	copyVec3Into(camera.position, frame.position);
	setCameraForward(camera, frame.forward);
	camera.universeSign = frame.universeSign < 0 ? -1 : 1;
	camera.pendingYaw = 0;
	camera.pendingPitch = 0;
}

export function animationKeyframeFromCamera(
	camera: CameraState,
	controls: ShaderControls,
	asciiEnabled: boolean,
	duration = 0,
): BlackHoleAnimationKeyframe {
	return {
		duration,
		position: [...camera.position],
		forward: [...camera.forward],
		universeSign: camera.universeSign,
		ease: "cinematic",
		timeScale: controls.timeScale,
		exposure: controls.exposure,
		bloomStrength: controls.bloomStrength,
		temporalJitter: controls.temporalJitter,
		asciiEnabled,
		textSize: controls.textSize,
		brightness: controls.brightness,
		contrast: controls.contrast,
		glyphPreset: controls.glyphPreset,
		customGlyphs: controls.customGlyphs,
		paletteMode: controls.paletteMode,
		shadowColor: controls.shadowColor,
		midColor: controls.midColor,
		highlightColor: controls.highlightColor,
	};
}

export function framesRoughlyEqual(
	a: BlackHoleAnimationKeyframe,
	b: BlackHoleAnimationKeyframe,
): boolean {
	return (
		length(subtract(a.position, b.position)) < 0.001 &&
		length(subtract(a.forward, b.forward)) < 0.001 &&
		a.universeSign === b.universeSign
	);
}

export function buildRouteTransitionSequence(
	current: BlackHoleAnimationKeyframe,
	route: BlackHoleAnimationRouteKey,
): BlackHoleAnimationKeyframe[] {
	const config = getBlackHoleRouteAnimation(route);
	const introStart = config.intro[0];
	if (!introStart) return [current];

	const sequence = [
		current,
		...config.transition.map((frame) => ({ ...frame })),
	] satisfies BlackHoleAnimationKeyframe[];
	const lastFrame = sequence[sequence.length - 1];
	if (!framesRoughlyEqual(lastFrame, introStart)) {
		sequence.push({
			...introStart,
			duration: Math.max(1.2, introStart.duration),
		});
	}
	return sequence;
}

export function stringifyAnimationValue(value: unknown): string {
	return JSON.stringify(value, null, "\t");
}

export function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function finiteNumber(
	value: number | undefined,
	fallback: number,
): number {
	return Number.isFinite(value) ? Number(value) : fallback;
}

export function floorNumber(
	value: number | undefined,
	floor: number,
	fallback = floor,
): number {
	const nextValue = finiteNumber(value, fallback);
	return nextValue < floor ? floor : nextValue;
}

export function sanitizeGlyphs(value: string, addBlank = true): string {
	const glyphs = Array.from(
		value.trim().length > 0 ? value : GLYPH_PRESETS.gargantua,
	);
	const unique: string[] = [];
	const seen = new Set<string>();

	if (addBlank && !seen.has(" ")) {
		seen.add(" ");
		unique.push(" ");
	}

	for (const glyph of glyphs) {
		if (seen.has(glyph)) continue;
		seen.add(glyph);
		unique.push(glyph);
		if (unique.length >= MAX_GLYPHS) break;
	}

	return unique.join("");
}

export function glyphsForControls(controls: ShaderControls): string {
	if (controls.glyphPreset === "custom") {
		return sanitizeGlyphs(controls.customGlyphs, false);
	}

	return sanitizeGlyphs(GLYPH_PRESETS[controls.glyphPreset]);
}

export function cellSizeForText(
	textSize: number,
	glyphCount: number,
): AsciiCellSize {
	const requestedHeight = Math.max(
		MIN_TEXT_SIZE,
		Math.round(
			floorNumber(textSize, MIN_TEXT_SIZE, DEFAULT_SHADER_CONTROLS.textSize),
		),
	);
	const safeGlyphCount = Math.max(1, glyphCount);
	const maxCellWidth = Math.max(
		1,
		Math.floor(MAX_GLYPH_ATLAS_DIMENSION / safeGlyphCount),
	);
	const requestedWidth = Math.max(1, Math.round(requestedHeight * 0.67));
	const width = Math.min(requestedWidth, maxCellWidth);
	const height = Math.min(
		requestedHeight,
		MAX_GLYPH_ATLAS_DIMENSION,
		Math.max(MIN_TEXT_SIZE, Math.round(width / 0.67)),
	);
	return {
		x: width,
		y: height,
	};
}

export function createGlyphAtlasConfig(
	controls: ShaderControls,
): GlyphAtlasConfig {
	const glyphs = glyphsForControls(controls);
	const glyphCount = Array.from(glyphs).length;
	const cellSize = cellSizeForText(controls.textSize, glyphCount);
	const textSize = cellSize.y;

	return {
		glyphs,
		glyphCount,
		fontFamily: controls.fontFamily,
		textSize,
		cellSize,
		key: `${glyphs}\n${controls.fontFamily}\n${textSize}`,
	};
}

export function createGlyphAtlasRaster(
	config: GlyphAtlasConfig,
): GlyphAtlasRaster {
	const glyphs = Array.from(config.glyphs);
	const glyphCount = Math.max(1, glyphs.length);
	const width = Math.max(1, config.cellSize.x * glyphCount);
	const height = Math.max(1, config.cellSize.y);
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");

	if (!context) throw new Error("Could not create ASCII glyph atlas canvas.");

	canvas.width = width;
	canvas.height = height;
	context.clearRect(0, 0, width, height);
	context.fillStyle = "#ffffff";
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.font = `${config.textSize}px "${config.fontFamily}", monospace`;

	for (let index = 0; index < glyphCount; index++) {
		context.fillText(
			glyphs[index] ?? " ",
			index * config.cellSize.x + config.cellSize.x * 0.5,
			config.cellSize.y * 0.56,
			config.cellSize.x,
		);
	}

	const imageData = context.getImageData(0, 0, width, height);
	const metricsCanvas = document.createElement("canvas");
	const metricsContext = metricsCanvas.getContext("2d");

	if (!metricsContext)
		throw new Error("Could not create ASCII glyph metrics canvas.");

	metricsCanvas.width = glyphCount;
	metricsCanvas.height = 1;
	const metricsData = metricsContext.createImageData(glyphCount, 1);
	const cellArea = Math.max(1, config.cellSize.x * config.cellSize.y);

	const coverages = glyphs.map((_, glyphIndex) => {
		let alpha = 0;
		for (let y = 0; y < height; y++)
			for (let x = 0; x < config.cellSize.x; x++) {
				alpha +=
					imageData.data[
						(y * width + glyphIndex * config.cellSize.x + x) * 4 + 3
					];
			}
		return alpha / (255 * cellArea);
	});
	const sorted = context.createImageData(width, height);
	for (const [rank, entry] of rankGlyphs(coverages).entries()) {
		for (let y = 0; y < height; y++)
			for (let x = 0; x < config.cellSize.x; x++) {
				const from = (y * width + entry.index * config.cellSize.x + x) * 4;
				const to = (y * width + rank * config.cellSize.x + x) * 4;
				sorted.data.set(imageData.data.subarray(from, from + 4), to);
			}
		metricsData.data.set(
			[
				Math.round(entry.coverage * 255),
				Math.round(entry.density * 255),
				glyphDirection(glyphs[entry.index]),
				255,
			],
			rank * 4,
		);
	}
	context.putImageData(sorted, 0, 0);

	metricsContext.putImageData(metricsData, 0, 0);

	return { canvas, metricsCanvas };
}

export function normalizeHexColor(value: string, fallback: string): string {
	if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
	return fallback;
}

export function hexToVec3(value: string, fallback: string): Vec3 {
	const hex = normalizeHexColor(value, fallback);
	const numberValue = Number.parseInt(hex.slice(1), 16);
	return [
		((numberValue >> 16) & 255) / 255,
		((numberValue >> 8) & 255) / 255,
		(numberValue & 255) / 255,
	];
}

export function writeHexToVec3(
	target: Vec3,
	value: string,
	fallback: string,
): Vec3 {
	const hex = normalizeHexColor(value, fallback);
	const numberValue = Number.parseInt(hex.slice(1), 16);
	target[0] = ((numberValue >> 16) & 255) / 255;
	target[1] = ((numberValue >> 8) & 255) / 255;
	target[2] = (numberValue & 255) / 255;
	return target;
}

export function createInitialControls(props: Props): ShaderControls {
	return {
		...DEFAULT_SHADER_CONTROLS,
		timeScale: finiteNumber(
			props.timeScale ?? DEFAULT_SHADER_CONTROLS.timeScale,
			DEFAULT_SHADER_CONTROLS.timeScale,
		),
		exposure: finiteNumber(
			props.exposure ?? DEFAULT_SHADER_CONTROLS.exposure,
			DEFAULT_SHADER_CONTROLS.exposure,
		),
		bloomStrength: finiteNumber(
			props.bloomStrength ?? DEFAULT_SHADER_CONTROLS.bloomStrength,
			DEFAULT_SHADER_CONTROLS.bloomStrength,
		),
		temporalJitter: floorNumber(
			props.temporalJitter ?? DEFAULT_SHADER_CONTROLS.temporalJitter,
			0,
			DEFAULT_SHADER_CONTROLS.temporalJitter,
		),
		invertControls:
			props.invertControls ?? DEFAULT_SHADER_CONTROLS.invertControls,
		paletteMode: props.paletteMode ?? DEFAULT_SHADER_CONTROLS.paletteMode,
		shadowColor: normalizeHexColor(
			props.shadowColor ?? DEFAULT_SHADER_CONTROLS.shadowColor,
			DEFAULT_SHADER_CONTROLS.shadowColor,
		),
		midColor: normalizeHexColor(
			props.midColor ?? DEFAULT_SHADER_CONTROLS.midColor,
			DEFAULT_SHADER_CONTROLS.midColor,
		),
		highlightColor: normalizeHexColor(
			props.highlightColor ?? DEFAULT_SHADER_CONTROLS.highlightColor,
			DEFAULT_SHADER_CONTROLS.highlightColor,
		),
		glyphPreset: props.glyphPreset ?? DEFAULT_SHADER_CONTROLS.glyphPreset,
		customGlyphs: props.customGlyphs ?? DEFAULT_SHADER_CONTROLS.customGlyphs,
		fontFamily: props.fontFamily ?? DEFAULT_SHADER_CONTROLS.fontFamily,
		textSize: floorNumber(
			props.textSize ?? DEFAULT_SHADER_CONTROLS.textSize,
			MIN_TEXT_SIZE,
			DEFAULT_SHADER_CONTROLS.textSize,
		),
		brightness: finiteNumber(
			props.brightness ?? DEFAULT_SHADER_CONTROLS.brightness,
			DEFAULT_SHADER_CONTROLS.brightness,
		),
		contrast: finiteNumber(
			props.contrast ?? DEFAULT_SHADER_CONTROLS.contrast,
			DEFAULT_SHADER_CONTROLS.contrast,
		),
	};
}

export function createRenderUniforms(
	controls: ShaderControls,
	atlasConfig: GlyphAtlasConfig,
	asciiEnabled: boolean,
	asciiMix: number,
): RenderUniforms {
	return {
		asciiCellSize: atlasConfig.cellSize,
		asciiMix: asciiEnabled ? clamp(asciiMix, 0, 1) : 0,
		glyphCount: Math.max(1, atlasConfig.glyphCount),
		exposure: finiteNumber(controls.exposure, DEFAULT_SHADER_CONTROLS.exposure),
		bloomStrength: finiteNumber(
			controls.bloomStrength,
			DEFAULT_SHADER_CONTROLS.bloomStrength,
		),
		temporalJitter: floorNumber(
			controls.temporalJitter,
			0,
			DEFAULT_SHADER_CONTROLS.temporalJitter,
		),
		asciiBrightness: finiteNumber(
			controls.brightness,
			DEFAULT_SHADER_CONTROLS.brightness,
		),
		asciiContrast: finiteNumber(
			controls.contrast,
			DEFAULT_SHADER_CONTROLS.contrast,
		),
		paletteMode: controls.paletteMode === "custom" ? 1 : 0,
		shadowColor: hexToVec3(
			controls.shadowColor,
			DEFAULT_SHADER_CONTROLS.shadowColor,
		),
		midColor: hexToVec3(controls.midColor, DEFAULT_SHADER_CONTROLS.midColor),
		highlightColor: hexToVec3(
			controls.highlightColor,
			DEFAULT_SHADER_CONTROLS.highlightColor,
		),
	};
}

export function writeRenderUniforms(
	target: RenderUniforms,
	controls: ShaderControls,
	atlasConfig: GlyphAtlasConfig,
	asciiEnabled: boolean,
	asciiMix: number,
): RenderUniforms {
	target.asciiCellSize = atlasConfig.cellSize;
	target.asciiMix = asciiEnabled ? clamp(asciiMix, 0, 1) : 0;
	target.glyphCount = Math.max(1, atlasConfig.glyphCount);
	target.exposure = finiteNumber(
		controls.exposure,
		DEFAULT_SHADER_CONTROLS.exposure,
	);
	target.bloomStrength = finiteNumber(
		controls.bloomStrength,
		DEFAULT_SHADER_CONTROLS.bloomStrength,
	);
	target.temporalJitter = floorNumber(
		controls.temporalJitter,
		0,
		DEFAULT_SHADER_CONTROLS.temporalJitter,
	);
	target.asciiBrightness = finiteNumber(
		controls.brightness,
		DEFAULT_SHADER_CONTROLS.brightness,
	);
	target.asciiContrast = finiteNumber(
		controls.contrast,
		DEFAULT_SHADER_CONTROLS.contrast,
	);
	target.paletteMode = controls.paletteMode === "custom" ? 1 : 0;
	writeHexToVec3(
		target.shadowColor,
		controls.shadowColor,
		DEFAULT_SHADER_CONTROLS.shadowColor,
	);
	writeHexToVec3(
		target.midColor,
		controls.midColor,
		DEFAULT_SHADER_CONTROLS.midColor,
	);
	writeHexToVec3(
		target.highlightColor,
		controls.highlightColor,
		DEFAULT_SHADER_CONTROLS.highlightColor,
	);
	return target;
}

export function isControlKeyboardTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return Boolean(
		target.closest("[data-black-hole-control]") ||
			target.isContentEditable ||
			["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName),
	);
}

export function resolveQualitySettings({
	quality,
	prepassScale,
	bloomScale,
	sceneScale,
	maxDevicePixelRatio,
	asciiEnabled = true,
	resolutionScale = 1,
	cellWidth,
	cellHeight,
	frameIntervalMs,
	enableBloomPass,
}: Pick<
	Props,
	| "quality"
	| "prepassScale"
	| "bloomScale"
	| "sceneScale"
	| "maxDevicePixelRatio"
	| "asciiEnabled"
	| "resolutionScale"
	| "cellWidth"
	| "cellHeight"
	| "frameIntervalMs"
	| "enableBloomPass"
>) {
	const extras = {
		cellWidth: floorNumber(cellWidth ?? DEFAULT_ASCII_CELL_SIZE.x, 2),
		cellHeight: floorNumber(cellHeight ?? DEFAULT_ASCII_CELL_SIZE.y, 2),
		frameIntervalMs: floorNumber(
			frameIntervalMs ?? DEFAULT_ASCII_CELL_FRAME_INTERVAL_MS,
			0,
		),
		enableBloomPass: enableBloomPass ?? true,
	};

	if (typeof quality === "number") {
		const qualityValue = floorNumber(quality, MIN_QUALITY_VALUE, 0.72);
		return {
			qualityValue,
			initialPrepassScale: floorNumber(
				prepassScale ??
					(asciiEnabled ? 0.3 * qualityValue : 0.5 * qualityValue),
				MIN_PREPASS_SCALE,
			),
			bloomScale: floorNumber(
				bloomScale ?? (asciiEnabled ? 0.3 : 0.5),
				MIN_RENDER_SCALE,
			),
			sceneScale: floorNumber(
				sceneScale ?? (asciiEnabled ? 0.4 : 1),
				MIN_RENDER_SCALE,
			),
			maxDevicePixelRatio: floorNumber(
				maxDevicePixelRatio ?? (asciiEnabled ? 1 : 1.25),
				MIN_DPR,
			),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 1),
			...extras,
		};
	}

	if (quality === "mobile-safe") {
		return {
			qualityValue: 0.72,
			initialPrepassScale: floorNumber(prepassScale ?? 0.18, MIN_PREPASS_SCALE),
			bloomScale: floorNumber(bloomScale ?? 0.12, MIN_RENDER_SCALE),
			sceneScale: floorNumber(sceneScale ?? 0.22, MIN_RENDER_SCALE),
			maxDevicePixelRatio: floorNumber(maxDevicePixelRatio ?? 0.6, MIN_DPR),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 0.8),
			...extras,
			cellWidth: floorNumber(cellWidth ?? 7, 2),
			cellHeight: floorNumber(cellHeight ?? 11, 2),
			frameIntervalMs: floorNumber(frameIntervalMs ?? 50, 0),
			enableBloomPass: enableBloomPass ?? true,
		};
	}

	if (quality === "ascii-balanced" || quality === "cinematic-ascii") {
		const cinematic = quality === "cinematic-ascii";
		return {
			qualityValue: cinematic ? 0.72 : 0.58,
			initialPrepassScale: floorNumber(prepassScale ?? 0.22, MIN_PREPASS_SCALE),
			bloomScale: floorNumber(
				bloomScale ?? (cinematic ? 0.3 : 0.18),
				MIN_RENDER_SCALE,
			),
			sceneScale: floorNumber(sceneScale ?? 0.28, MIN_RENDER_SCALE),
			maxDevicePixelRatio: floorNumber(maxDevicePixelRatio ?? 0.85, MIN_DPR),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 1),
			...extras,
			cellWidth: floorNumber(cellWidth ?? 6, 2),
			cellHeight: floorNumber(cellHeight ?? 9, 2),
			frameIntervalMs: floorNumber(frameIntervalMs ?? 33, 0),
			enableBloomPass: enableBloomPass ?? cinematic,
		};
	}

	if (quality === "ascii-sharp") {
		return {
			qualityValue: 0.72,
			initialPrepassScale: floorNumber(prepassScale ?? 0.28, MIN_PREPASS_SCALE),
			bloomScale: floorNumber(bloomScale ?? 0.22, MIN_RENDER_SCALE),
			sceneScale: floorNumber(sceneScale ?? 0.35, MIN_RENDER_SCALE),
			maxDevicePixelRatio: floorNumber(maxDevicePixelRatio ?? 1, MIN_DPR),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 1),
			...extras,
			cellWidth: floorNumber(cellWidth ?? 5, 2),
			cellHeight: floorNumber(cellHeight ?? 8, 2),
			frameIntervalMs: floorNumber(frameIntervalMs ?? 24, 0),
			enableBloomPass: enableBloomPass ?? false,
		};
	}

	if (quality === "performance") {
		return {
			qualityValue: 0.65,
			initialPrepassScale: floorNumber(
				prepassScale ?? (asciiEnabled ? 0.25 : MIN_PREPASS_SCALE),
				MIN_PREPASS_SCALE,
			),
			bloomScale: floorNumber(
				bloomScale ?? (asciiEnabled ? 0.25 : 0.35),
				MIN_RENDER_SCALE,
			),
			sceneScale: floorNumber(
				sceneScale ?? (asciiEnabled ? 0.28 : 0.8),
				MIN_RENDER_SCALE,
			),
			maxDevicePixelRatio: floorNumber(maxDevicePixelRatio ?? 1, MIN_DPR),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 1),
			...extras,
		};
	}

	if (quality === "visual") {
		return {
			qualityValue: 1,
			initialPrepassScale: floorNumber(prepassScale ?? 0.67, MIN_PREPASS_SCALE),
			bloomScale: floorNumber(bloomScale ?? 0.67, MIN_RENDER_SCALE),
			sceneScale: floorNumber(
				sceneScale ?? (asciiEnabled ? 0.65 : 1),
				MIN_RENDER_SCALE,
			),
			maxDevicePixelRatio: floorNumber(maxDevicePixelRatio ?? 1.5, MIN_DPR),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 1),
			...extras,
		};
	}

	if (quality === "desktop-full") {
		return {
			qualityValue: 0.9,
			initialPrepassScale: floorNumber(prepassScale ?? 0.5, MIN_PREPASS_SCALE),
			bloomScale: floorNumber(bloomScale ?? 0.45, MIN_RENDER_SCALE),
			sceneScale: floorNumber(sceneScale ?? 0.6, MIN_RENDER_SCALE),
			maxDevicePixelRatio: floorNumber(maxDevicePixelRatio ?? 1.25, MIN_DPR),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 1),
			...extras,
			frameIntervalMs: floorNumber(frameIntervalMs ?? 16, 0),
			enableBloomPass: enableBloomPass ?? true,
		};
	}

	if (quality === "stress-test") {
		return {
			qualityValue: 1,
			initialPrepassScale: floorNumber(prepassScale ?? 0.75, MIN_PREPASS_SCALE),
			bloomScale: floorNumber(bloomScale ?? 0.7, MIN_RENDER_SCALE),
			sceneScale: floorNumber(sceneScale ?? 1, MIN_RENDER_SCALE),
			maxDevicePixelRatio: floorNumber(maxDevicePixelRatio ?? 2, MIN_DPR),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 1),
			...extras,
			cellWidth: floorNumber(cellWidth ?? 4, 2),
			cellHeight: floorNumber(cellHeight ?? 6, 2),
			frameIntervalMs: floorNumber(frameIntervalMs ?? 0, 0),
			enableBloomPass: enableBloomPass ?? true,
		};
	}

	return {
		qualityValue: 0.72,
		initialPrepassScale: floorNumber(
			prepassScale ?? (asciiEnabled ? 0.3 : MIN_PREPASS_SCALE),
			MIN_PREPASS_SCALE,
		),
		bloomScale: floorNumber(
			bloomScale ?? (asciiEnabled ? 0.3 : 0.4),
			MIN_RENDER_SCALE,
		),
		sceneScale: floorNumber(
			sceneScale ?? (asciiEnabled ? 0.36 : 1),
			MIN_RENDER_SCALE,
		),
		maxDevicePixelRatio: floorNumber(
			maxDevicePixelRatio ?? (asciiEnabled ? 1 : 1.25),
			MIN_DPR,
		),
		resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 1),
		...extras,
	};
}

export function qualityPresetFromProp(
	quality: QualityProp | undefined,
): QualityPreset {
	return typeof quality === "string" ? quality : "custom";
}

export function defaultQualityPresetForRuntime(): Exclude<
	QualityPreset,
	"custom"
> {
	if (typeof window === "undefined") return "cinematic-ascii";
	const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
	const narrowViewport = Math.min(window.innerWidth, window.innerHeight) <= 768;
	return coarsePointer || narrowViewport ? "mobile-safe" : "cinematic-ascii";
}

export function createRenderSettingsFromQuality({
	quality,
	asciiEnabled,
	prepassScale,
	bloomScale,
	sceneScale,
	maxDevicePixelRatio,
	resolutionScale,
}: Pick<
	Props,
	| "quality"
	| "asciiEnabled"
	| "prepassScale"
	| "bloomScale"
	| "sceneScale"
	| "maxDevicePixelRatio"
	| "resolutionScale"
	| "cellWidth"
	| "cellHeight"
	| "frameIntervalMs"
	| "enableBloomPass"
>): RenderSettings {
	const activeAsciiEnabled = asciiEnabled ?? true;
	const activeQuality = quality ?? defaultQualityPresetForRuntime();
	const resolved = resolveQualitySettings({
		quality: activeQuality,
		prepassScale,
		bloomScale,
		sceneScale,
		maxDevicePixelRatio,
		asciiEnabled: activeAsciiEnabled,
		resolutionScale,
	});

	return {
		asciiEnabled: activeAsciiEnabled,
		qualityPreset: qualityPresetFromProp(activeQuality),
		qualityValue: resolved.qualityValue,
		maxDevicePixelRatio: resolved.maxDevicePixelRatio,
		sceneScale: resolved.sceneScale,
		prepassScale: resolved.initialPrepassScale,
		bloomScale: resolved.bloomScale,
		resolutionScale: resolved.resolutionScale,
		cellWidth: resolved.cellWidth,
		cellHeight: resolved.cellHeight,
		frameIntervalMs: resolved.frameIntervalMs,
		enableBloomPass: resolved.enableBloomPass,
	};
}

export function createPresetRenderSettings(
	preset: Exclude<QualityPreset, "custom">,
	asciiEnabled: boolean,
): Omit<RenderSettings, "asciiEnabled" | "qualityPreset"> {
	const resolved = resolveQualitySettings({
		quality: preset,
		asciiEnabled,
	});

	return {
		qualityValue: resolved.qualityValue,
		maxDevicePixelRatio: resolved.maxDevicePixelRatio,
		sceneScale: resolved.sceneScale,
		prepassScale: resolved.initialPrepassScale,
		bloomScale: resolved.bloomScale,
		resolutionScale: resolved.resolutionScale,
		cellWidth: resolved.cellWidth,
		cellHeight: resolved.cellHeight,
		frameIntervalMs: resolved.frameIntervalMs,
		enableBloomPass: resolved.enableBloomPass,
	};
}

export function resolveRenderSettings(settings: RenderSettings) {
	return {
		...settings,
		qualityValue: floorNumber(settings.qualityValue, MIN_QUALITY_VALUE, 0.72),
		maxDevicePixelRatio: floorNumber(settings.maxDevicePixelRatio, MIN_DPR, 1),
		sceneScale: floorNumber(settings.sceneScale, MIN_RENDER_SCALE, 1),
		prepassScale: floorNumber(
			settings.prepassScale,
			MIN_PREPASS_SCALE,
			MIN_PREPASS_SCALE,
		),
		bloomScale: floorNumber(settings.bloomScale, MIN_RENDER_SCALE, 0.3),
		resolutionScale: floorNumber(settings.resolutionScale, MIN_RENDER_SCALE, 1),
		cellWidth: floorNumber(settings.cellWidth, 2, DEFAULT_ASCII_CELL_SIZE.x),
		cellHeight: floorNumber(settings.cellHeight, 2, DEFAULT_ASCII_CELL_SIZE.y),
		frameIntervalMs: floorNumber(settings.frameIntervalMs, 0, 0),
		enableBloomPass: settings.enableBloomPass,
	};
}

export function detectRuntimeProfile(): RuntimeProfile {
	if (typeof window === "undefined") return "desktop";
	const navigatorLike = window.navigator as Navigator & {
		deviceMemory?: number;
		hardwareConcurrency?: number;
	};
	const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
	const narrowViewport = Math.min(window.innerWidth, window.innerHeight) <= 768;
	const lowMemory =
		typeof navigatorLike.deviceMemory === "number" &&
		navigatorLike.deviceMemory <= 4;
	const lowConcurrency =
		typeof navigatorLike.hardwareConcurrency === "number" &&
		navigatorLike.hardwareConcurrency <= 4;

	if (lowMemory || lowConcurrency) return "lowPower";
	if (coarsePointer || narrowViewport) return "mobile";
	return "desktop";
}

export function resolveRendererMode(mode: RendererMode): ResolvedRendererMode {
	if (mode === "ascii-cell") return "ascii-cell";
	return "full";
}

export function isWebGpuAvailable(): boolean {
	return typeof navigator !== "undefined" && Boolean(navigator.gpu);
}

export function resolveShaderBackend(
	backend: ShaderBackend,
	_resolvedMode: ResolvedRendererMode,
): ResolvedShaderBackend {
	if (backend === "webgl2") return "webgl2";
	if (backend === "webgpu" || isWebGpuAvailable()) return "webgpu";
	return "webgl2";
}

export function estimateTextureMemoryBytes(
	width: number,
	height: number,
	bytesPerPixel: number,
	count = 1,
): number {
	return Math.max(0, width) * Math.max(0, height) * bytesPerPixel * count;
}

export function updateCamera(
	camera: CameraState,
	keyboardData: Uint8Array,
	delta: number,
	movementSpeed: number,
) {
	if (camera.pendingYaw !== 0 || camera.pendingPitch !== 0) {
		camera.forward = normalize(
			rotateAxis(camera.forward, camera.up, camera.pendingYaw),
		);
		camera.right = normalize(
			rotateAxis(camera.right, camera.up, camera.pendingYaw),
		);
		camera.forward = normalize(
			rotateAxis(camera.forward, camera.right, camera.pendingPitch),
		);
		camera.up = normalize(cross(camera.right, camera.forward));
		camera.right = normalize(cross(camera.forward, camera.up));
		camera.pendingYaw = 0;
		camera.pendingPitch = 0;
	}

	let roll = 0;
	if (keyboardData[81 * 4] > 0) roll -= ROLL_SPEED * delta;
	if (keyboardData[69 * 4] > 0) roll += ROLL_SPEED * delta;

	if (roll !== 0) {
		camera.right = normalize(rotateAxis(camera.right, camera.forward, roll));
		camera.up = normalize(cross(camera.right, camera.forward));
	}

	let moveDir: Vec3 = [0, 0, 0];
	if (keyboardData[87 * 4] > 0) moveDir = add(moveDir, camera.forward);
	if (keyboardData[83 * 4] > 0) moveDir = subtract(moveDir, camera.forward);
	if (keyboardData[65 * 4] > 0) moveDir = subtract(moveDir, camera.right);
	if (keyboardData[68 * 4] > 0) moveDir = add(moveDir, camera.right);
	if (keyboardData[82 * 4] > 0) moveDir = add(moveDir, camera.up);
	if (keyboardData[70 * 4] > 0) moveDir = subtract(moveDir, camera.up);

	if (length(moveDir) > 0) {
		const previousPosition = camera.position;
		const distance = length(camera.position);
		const speedScale =
			distance > 3
				? 1
				: distance > 0.5
					? 0.1 + (0.9 * (distance - 0.5)) / 2.5
					: 0.1;
		camera.position = add(
			camera.position,
			scale(normalize(moveDir), movementSpeed * delta * speedScale),
		);

		const spinRadius = Math.abs(0.997114514 * 0.5);
		if (previousPosition[1] * camera.position[1] < 0) {
			const t =
				previousPosition[1] / (previousPosition[1] - camera.position[1]);
			const crossPoint = add(
				previousPosition,
				scale(subtract(camera.position, previousPosition), t),
			);
			if (Math.hypot(crossPoint[0], crossPoint[2]) < spinRadius) {
				camera.universeSign *= -1;
			}
		}
	}
}
