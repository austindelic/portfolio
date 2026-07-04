import {
	ChevronDown,
	ChevronUp,
	Copy,
	Pause,
	Play,
	RotateCcw,
	SlidersHorizontal,
	Type,
} from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
	BLACK_HOLE_ANIMATION_ROUTE_OPTIONS,
	BLACK_HOLE_ANIMATION_ROUTES,
	type BlackHoleAnimationKeyframe,
	type BlackHoleAnimationRouteKey,
	getBlackHoleRouteAnimation,
	normalizeBlackHoleAnimationRoute,
} from "../config/black-hole-animation";
import asciiSource from "../shaders/black-hole/ascii.glsl?raw";
import bloomSource from "../shaders/black-hole/bloom.glsl?raw";
import bufferASource from "../shaders/black-hole/buffer-a.glsl?raw";
import bufferBSource from "../shaders/black-hole/buffer-b.glsl?raw";
import bufferCSource from "../shaders/black-hole/buffer-c.glsl?raw";
import bufferDSource from "../shaders/black-hole/buffer-d.glsl?raw";
import imageSource from "../shaders/black-hole/image.glsl?raw";

type Vec3 = [number, number, number];

type AsciiCellSize = {
	x: number;
	y: number;
};

type GlyphPreset = "gargantua" | "classic" | "dense" | "custom";
type PaletteMode = "source" | "custom";
type QualityPreset =
	| "mobile-safe"
	| "ascii-balanced"
	| "ascii-sharp"
	| "performance"
	| "balanced"
	| "visual"
	| "desktop-full"
	| "stress-test"
	| "custom";
type QualityProp = Exclude<QualityPreset, "custom"> | number;
type AnimationMode = "off" | "route" | "editor";
type AnimationPhase = "off" | "intro" | "transition" | "idle";
type RendererMode = "auto" | "full" | "ascii-cell" | "fallback-full";
type ResolvedRendererMode = "full" | "ascii-cell";
type ShaderBackend = "auto" | "webgl2" | "webgpu";
type ResolvedShaderBackend = "webgl2" | "webgpu";
type RuntimeProfile = "desktop" | "mobile" | "lowPower";
type FontFamily =
	| "Departure Mono"
	| "DSEG14Modern"
	| "Menlo"
	| "Courier New"
	| "monospace";

type ShaderControls = {
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

type RenderSettings = {
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

type GlyphAtlasConfig = {
	glyphs: string;
	glyphCount: number;
	fontFamily: FontFamily;
	textSize: number;
	cellSize: AsciiCellSize;
	key: string;
};

type GlyphAtlasRaster = {
	canvas: HTMLCanvasElement;
	metricsCanvas: HTMLCanvasElement;
};

type GlyphTextureSet = {
	atlas: TextureLike;
	metrics: TextureLike;
	dispose: () => void;
};

type RenderUniforms = {
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

type TextureLike = {
	texture: WebGLTexture;
	width: number;
	height: number;
};

type RenderTarget = TextureLike & {
	framebuffer: WebGLFramebuffer;
};

type MultiRenderTarget = {
	framebuffer: WebGLFramebuffer;
	textures: TextureLike[];
	width: number;
	height: number;
	dispose: () => void;
};

type PingPongTarget = {
	read: RenderTarget;
	write: RenderTarget;
	swap: () => void;
	dispose: () => void;
};

type TextureFormat = {
	internalFormat: number;
	format: number;
	type: number;
	canFilterLinear: boolean;
};

type ProgramPass = {
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
	};
};

type OptimizedPassSet = {
	prepass: ProgramPass;
	composite: ProgramPass;
	bloom: ProgramPass;
	image: ProgramPass;
	ascii: ProgramPass;
};

type FallbackPassSet = {
	a: ProgramPass;
	b: ProgramPass;
	c: ProgramPass;
	d: ProgramPass;
	image: ProgramPass;
	ascii: ProgramPass;
};

type OptimizedTargets = {
	prepass: MultiRenderTarget;
	composite: PingPongTarget;
	bloomMip: RenderTarget;
	bloomHorizontal: RenderTarget;
	bloomVertical: RenderTarget;
	scene: RenderTarget;
};

type FallbackTargets = {
	a: PingPongTarget;
	b: PingPongTarget;
	c: RenderTarget;
	d: RenderTarget;
	scene: RenderTarget;
};

type CameraState = {
	position: Vec3;
	right: Vec3;
	up: Vec3;
	forward: Vec3;
	universeSign: number;
	pendingYaw: number;
	pendingPitch: number;
};

type BlackHoleStats = {
	mode: "optimized" | "fallback" | "ascii-cell" | "webgpu";
	backend: ResolvedShaderBackend;
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

type Props = {
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

type RuntimeSnapshot = {
	cameraPosition?: Vec3;
	cameraForward?: Vec3;
	universeSign?: number;
	shaderTime?: number;
	movementSpeed?: number;
};

type PersistentAnimationSnapshot = Required<RuntimeSnapshot> & {
	route: BlackHoleAnimationRouteKey;
};

type BenchmarkResult = {
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

type CameraEditorApi = {
	applyPosition: (value: string) => boolean;
	applyForward: (value: string) => boolean;
	applyUniverse: (value: string) => boolean;
	sync: () => void;
};

type AnimationEditorApi = {
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

const VERTEX_SOURCE = `#version 300 es
in vec2 aPosition;
void main() {
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_HEADER = `#version 300 es
precision highp float;
precision highp int;

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec3 iChannelResolution[4];
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

uniform vec3 uCameraPosition;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform float uUniverseSign;
uniform float uQuality;
uniform float uTemporalJitter;
uniform float uBlendWeight;
uniform int uBloomMode;
uniform vec2 uCanvasResolution;
uniform vec2 uAsciiCellSize;
uniform float uAsciiMix;
uniform int uGlyphCount;
uniform float uAsciiBrightness;
uniform float uAsciiContrast;
uniform int uPaletteMode;
uniform vec3 uShadowColor;
uniform vec3 uMidColor;
uniform vec3 uHighlightColor;
uniform float uExposure;
uniform float uBloomStrength;
`;

const BLACK_HOLE_HELPERS = `
void BuildCameraFrame(out mat4 inverseCamRot, out vec4 relativePos, out vec4 relativeDiskNormal, out vec4 relativeDiskTangent, out vec3 mapCamDir)
{
	vec3 camRight = normalize(uCameraRight);
	vec3 camUp = normalize(uCameraUp);
	vec3 camBack = normalize(cross(camRight, camUp));
	mat3 camRot = mat3(camRight, camUp, camBack);

	inverseCamRot = mat4(camRot);
	relativePos = vec4(transpose(camRot) * (-uCameraPosition), 0.0);
	relativeDiskNormal = vec4(transpose(camRot) * vec3(0.0, 1.0, 0.0), 0.0);
	relativeDiskTangent = vec4(transpose(camRot) * vec3(1.0, 0.0, 0.0), 0.0);
	mapCamDir = normalize((inverseCamRot * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
}

TraceResult TraceFromCamera(vec2 uv, vec2 resolution, float jitterScale, out mat4 inverseCamRot, out vec3 mapCamDir)
{
	vec4 relativePos;
	vec4 relativeDiskNormal;
	vec4 relativeDiskTangent;
	BuildCameraFrame(inverseCamRot, relativePos, relativeDiskNormal, relativeDiskTangent, mapCamDir);

	vec2 jitter = vec2(RandomStep(uv, fract(iTime * 1.0 + 0.5)), RandomStep(uv, fract(iTime * 1.0))) / resolution;
	return TraceRay(uv + jitterScale * uTemporalJitter * jitter, resolution, inverseCamRot, relativePos, relativeDiskNormal, relativeDiskTangent, uUniverseSign);
}

vec4 FinalizeTrace(TraceResult res, vec2 uv, mat4 inverseCamRot, vec3 mapCamDir)
{
	vec4 finalColor = res.AccumColor;
	float currentStatus = res.Status;
	vec3 currentDir = res.EscapeDir;
	float currentShift = res.FreqShift;

	if (currentStatus > 0.5 && currentStatus < 20.0 && currentStatus != 3.0)
	{
		vec4 bg = SampleBackground(currentDir, currentShift, currentStatus);
		float invA = 1.0 - finalColor.a;
		finalColor += 0.9999 * bg * vec4(pow(invA, 1.0), pow(invA, 1.6), pow(invA, 2.5), 1.0);
	}

	finalColor = ApplyToneMapping(finalColor, currentShift);

	return finalColor;
}
`;

const PREPASS_MAIN = `
layout(location = 0) out vec4 outDistortionFlag;
layout(location = 1) out vec4 outVolumetric;

void main()
{
	vec2 resolution = iResolution.xy;
	vec2 uv = gl_FragCoord.xy / resolution;
	mat4 inverseCamRot;
	vec3 mapCamDir;
	TraceResult res = TraceFromCamera(uv, resolution, 0.5, inverseCamRot, mapCamDir);

	outDistortionFlag = vec4(res.EscapeDir * res.FreqShift, res.Status);
	outVolumetric = res.AccumColor;
}
`;

const COMPOSITE_MAIN = `
out vec4 shadertoyFragColor;

ivec2 ClampCoord(ivec2 coord, ivec2 size)
{
	return clamp(coord, ivec2(0), size - ivec2(1));
}

bool IsOpaqueStatus(float status)
{
	return abs(round(status) - 3.0) < 0.1;
}

bool IsSensitiveBoundary(float a, float b)
{
	return abs(round(a) - round(b)) > 0.1 || abs(a - b) > 0.35;
}

void ManualBilinearSample(vec2 uv, out vec3 distortion, out vec4 volumetric, out float nearestStatus)
{
	ivec2 texSize = textureSize(iChannel0, 0);
	vec2 pixelPos = uv * vec2(texSize) - 0.5;
	ivec2 basePos = ivec2(floor(pixelPos));
	vec2 f = fract(pixelPos);

	ivec2 p00 = ClampCoord(basePos, texSize);
	ivec2 p10 = ClampCoord(basePos + ivec2(1, 0), texSize);
	ivec2 p01 = ClampCoord(basePos + ivec2(0, 1), texSize);
	ivec2 p11 = ClampCoord(basePos + ivec2(1, 1), texSize);

	vec4 d00 = texelFetch(iChannel0, p00, 0);
	vec4 d10 = texelFetch(iChannel0, p10, 0);
	vec4 d01 = texelFetch(iChannel0, p01, 0);
	vec4 d11 = texelFetch(iChannel0, p11, 0);

	vec4 v00 = texelFetch(iChannel1, p00, 0);
	vec4 v10 = texelFetch(iChannel1, p10, 0);
	vec4 v01 = texelFetch(iChannel1, p01, 0);
	vec4 v11 = texelFetch(iChannel1, p11, 0);

	distortion = mix(mix(d00.xyz, d10.xyz, f.x), mix(d01.xyz, d11.xyz, f.x), f.y);
	volumetric = mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);

	float w00 = (1.0 - f.x) * (1.0 - f.y);
	float w10 = f.x * (1.0 - f.y);
	float w01 = (1.0 - f.x) * f.y;
	float w11 = f.x * f.y;
	nearestStatus = d00.w;
	float maxWeight = w00;

	if (w10 > maxWeight) { maxWeight = w10; nearestStatus = d10.w; }
	if (w01 > maxWeight) { maxWeight = w01; nearestStatus = d01.w; }
	if (w11 > maxWeight) { nearestStatus = d11.w; }
}

bool IsPrepassEdge(vec2 uv)
{
	ivec2 texSize = textureSize(iChannel0, 0);
	ivec2 center = ClampCoord(ivec2(floor(uv * vec2(texSize))), texSize);
	vec4 c = texelFetch(iChannel0, center, 0);
	vec4 l = texelFetch(iChannel0, ClampCoord(center + ivec2(-1, 0), texSize), 0);
	vec4 r = texelFetch(iChannel0, ClampCoord(center + ivec2(1, 0), texSize), 0);
	vec4 u = texelFetch(iChannel0, ClampCoord(center + ivec2(0, -1), texSize), 0);
	vec4 d = texelFetch(iChannel0, ClampCoord(center + ivec2(0, 1), texSize), 0);

	bool statusEdge = IsSensitiveBoundary(c.w, l.w) || IsSensitiveBoundary(c.w, r.w) || IsSensitiveBoundary(c.w, u.w) || IsSensitiveBoundary(c.w, d.w);

	return statusEdge;
}

void main()
{
	vec2 resolution = iResolution.xy;
	vec2 uv = gl_FragCoord.xy / resolution;
	mat4 inverseCamRot;
	vec3 mapCamDir;
	vec4 finalColor;

	if (IsPrepassEdge(uv))
	{
		TraceResult res = TraceFromCamera(uv, resolution, 0.0, inverseCamRot, mapCamDir);
		finalColor = FinalizeTrace(res, uv, inverseCamRot, mapCamDir);
	}
	else
	{
		vec3 distortion;
		vec4 volumetric;
		float nearestStatus;
		ManualBilinearSample(uv, distortion, volumetric, nearestStatus);

		TraceResult res;
		res.EscapeDir = distortion / max(length(distortion), 1e-9);
		res.FreqShift = length(distortion);
		res.Status = nearestStatus;
		res.AccumColor = volumetric;
		res.CurrentSign = uUniverseSign;

		vec4 relativePos;
		vec4 relativeDiskNormal;
		vec4 relativeDiskTangent;
		BuildCameraFrame(inverseCamRot, relativePos, relativeDiskNormal, relativeDiskTangent, mapCamDir);
		finalColor = FinalizeTrace(res, uv, inverseCamRot, mapCamDir);
	}

	if (iFrame > 0)
	{
		vec4 prevColor = texelFetch(iChannel2, ivec2(gl_FragCoord.xy), 0);
		finalColor = uBlendWeight * finalColor + (1.0 - uBlendWeight) * prevColor;
	}

	shadertoyFragColor = finalColor;
}
`;

const ASCII_CELL_TRACE_SOURCE = `
out vec4 shadertoyFragColor;

void main()
{
	vec2 canvasResolution = max(uCanvasResolution, vec2(1.0));
	vec2 cellSize = max(uAsciiCellSize, vec2(2.0));
	vec2 fullFragCoord = min(
		(gl_FragCoord.xy + vec2(0.5)) * cellSize,
		canvasResolution - vec2(0.5)
	);
	vec2 uv = fullFragCoord / canvasResolution;
	mat4 inverseCamRot;
	vec3 mapCamDir;
	TraceResult res = TraceFromCamera(uv, canvasResolution, 0.5, inverseCamRot, mapCamDir);

	shadertoyFragColor = FinalizeTrace(res, uv, inverseCamRot, mapCamDir);
}
`;

const WEBGPU_COMPUTE_SOURCE = `
struct Params {
	time_exposure_quality_glyph: vec4<f32>,
	shadow: vec4<f32>,
	mid: vec4<f32>,
	highlight: vec4<f32>,
	source_dims: vec4<f32>,
	canvas_dims: vec4<f32>,
	cell_size: vec4<f32>,
	camera_position: vec4<f32>,
	camera_right: vec4<f32>,
	camera_up: vec4<f32>,
	camera_forward: vec4<f32>,
};

@group(0) @binding(0) var cell_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> params: Params;

fn hash3(p: vec3<f32>) -> f32 {
	return fract(sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453123);
}

fn saturate_color(color: vec3<f32>) -> vec3<f32> {
	return clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn tone_map(color: vec3<f32>) -> vec3<f32> {
	var mapped = color / (vec3<f32>(1.0) + color);
	mapped = pow(saturate_color(mapped), vec3<f32>(0.72));
	return mapped;
}

fn star_field(dir: vec3<f32>) -> vec3<f32> {
	let cell = floor(normalize(dir) * 150.0);
	let star_seed = hash3(cell);
	let star = smoothstep(0.992, 1.0, star_seed);
	let cold = vec3<f32>(0.45, 0.62, 1.0);
	let warm = vec3<f32>(1.0, 0.86, 0.62);
	return mix(cold, warm, hash3(cell + vec3<f32>(17.0, 3.0, 91.0))) * star * (0.25 + 1.6 * hash3(cell + vec3<f32>(9.0)));
}

fn black_hole_color(uv: vec2<f32>) -> vec3<f32> {
	let canvas = max(params.canvas_dims.xy, vec2<f32>(1.0));
	let ndc = uv * 2.0 - vec2<f32>(1.0);
	let fov = 0.57735026;
	let ray_dir = normalize(
		params.camera_forward.xyz +
		params.camera_right.xyz * (ndc.x * fov) +
		params.camera_up.xyz * (ndc.y * fov * canvas.y / max(canvas.x, 1.0))
	);
	let camera_pos = params.camera_position.xyz;
	let time = params.time_exposure_quality_glyph.x;
	let exposure = params.time_exposure_quality_glyph.y;
	let quality = params.time_exposure_quality_glyph.z;

	let to_center = -camera_pos;
	let closest_t = max(dot(to_center, ray_dir), 0.0);
	let closest = camera_pos + ray_dir * closest_t;
	let impact = length(closest);
	let center_facing = smoothstep(0.0, 1.0, closest_t);

	var color = star_field(ray_dir) * (1.0 - smoothstep(0.86, 0.98, center_facing) * smoothstep(0.7, 4.0, impact) * 0.35);

	let horizon = center_facing * (1.0 - smoothstep(0.78, 1.15, impact));
	let photon_ring = center_facing * exp(-abs(impact - 1.32) * 7.0) * (0.55 + 0.45 * quality);
	let inner_ring = center_facing * exp(-abs(impact - 1.75) * 3.2);

	let denom = ray_dir.y;
	let disk_t = -camera_pos.y / select(0.0001 * sign(denom + 0.0001), denom, abs(denom) > 0.0001);
	let disk_pos = camera_pos + ray_dir * disk_t;
	let disk_radius = length(disk_pos.xz);
	let disk_angle = atan2(disk_pos.z, disk_pos.x);
	let disk_radial = smoothstep(2.0, 3.0, disk_radius) * (1.0 - smoothstep(14.0, 19.0, disk_radius));
	let disk_visible = select(0.0, 1.0, disk_t > 0.0);
	let disk_grazing = clamp(0.15 / max(abs(denom), 0.04), 0.0, 1.0);
	let orbital = 0.62 + 0.38 * sin(disk_angle * 18.0 - time * 5.0 + disk_radius * 0.9);
	let tangent = normalize(vec3<f32>(-disk_pos.z, 0.0, disk_pos.x));
	let doppler = clamp(0.72 + 0.52 * dot(tangent, -ray_dir), 0.25, 1.75);
	let disk = disk_visible * disk_radial * disk_grazing * orbital;
	let lensed_disk = center_facing * exp(-abs(impact - 2.35) * 1.35) * (0.25 + 0.75 * smoothstep(-0.2, 0.8, closest.y)) * (0.5 + 0.5 * sin(atan2(closest.z, closest.x) * 14.0 - time * 4.0));

	let heat = clamp(disk * doppler + lensed_disk * 0.45, 0.0, 2.5);
	let disk_color = mix(vec3<f32>(0.95, 0.24, 0.05), vec3<f32>(1.0, 0.92, 0.72), clamp(heat * 0.85 + photon_ring * 0.35, 0.0, 1.0));
	color += disk_color * heat * 1.75;
	color += vec3<f32>(0.6, 0.82, 1.0) * photon_ring * 1.4;
	color += vec3<f32>(0.95, 0.62, 0.32) * inner_ring * 0.35;
	color *= 1.0 - horizon * 0.98;

	return tone_map(color * exposure);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
	let dims = vec2<u32>(u32(params.source_dims.x), u32(params.source_dims.y));
	if (id.x >= dims.x || id.y >= dims.y) {
		return;
	}

	let canvas_resolution = max(params.canvas_dims.xy, vec2<f32>(1.0));
	let source_coord = vec2<f32>(f32(id.x), f32(id.y)) + vec2<f32>(0.5);
	let full_coord = select(source_coord, source_coord * max(params.cell_size.xy, vec2<f32>(1.0)), params.source_dims.w > 0.5);
	let uv = min(full_coord / canvas_resolution, vec2<f32>(0.99999));
	let color = black_hole_color(uv);

	textureStore(cell_texture, vec2<i32>(i32(id.x), i32(id.y)), vec4<f32>(saturate_color(color), 1.0));
}
`;

const WEBGPU_RENDER_SOURCE = `
struct Params {
	time_exposure_quality_glyph: vec4<f32>,
	shadow: vec4<f32>,
	mid: vec4<f32>,
	highlight: vec4<f32>,
	source_dims: vec4<f32>,
	canvas_dims: vec4<f32>,
	cell_size: vec4<f32>,
	camera_position: vec4<f32>,
	camera_right: vec4<f32>,
	camera_up: vec4<f32>,
	camera_forward: vec4<f32>,
};

struct VertexOut {
	@builtin(position) position: vec4<f32>,
	@location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var cell_texture: texture_2d<f32>;
@group(0) @binding(1) var glyph_texture: texture_2d<f32>;
@group(0) @binding(2) var glyph_metrics: texture_2d<f32>;
@group(0) @binding(3) var glyph_sampler: sampler;
@group(0) @binding(4) var<uniform> params: Params;

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
	var positions = array<vec2<f32>, 3>(
		vec2<f32>(-1.0, -1.0),
		vec2<f32>(3.0, -1.0),
		vec2<f32>(-1.0, 3.0),
	);
	let position = positions[vertex_index];
	var output: VertexOut;
	output.position = vec4<f32>(position, 0.0, 1.0);
	output.uv = position * 0.5 + vec2<f32>(0.5);
	return output;
}

fn palette_color(brightness: f32) -> vec3<f32> {
	if (brightness < 0.5) {
		return mix(params.shadow.xyz, params.mid.xyz, brightness * 2.0);
	}
	return mix(params.mid.xyz, params.highlight.xyz, (brightness - 0.5) * 2.0);
}

@fragment
fn fragment_main(input: VertexOut) -> @location(0) vec4<f32> {
	let frag_coord = input.uv * params.canvas_dims.xy;
	let cell_size = max(params.cell_size.xy, vec2<f32>(2.0));
	let cell_origin = floor(frag_coord / cell_size) * cell_size;
	let cell_uv = (frag_coord - cell_origin) / cell_size;
	let sample_uv = (cell_origin + cell_size * 0.5) / max(params.canvas_dims.xy, vec2<f32>(1.0));
	let cell_color = textureSample(cell_texture, glyph_sampler, sample_uv).rgb;
	let original_color = textureSample(cell_texture, glyph_sampler, input.uv).rgb;
	let ascii_mix = clamp(params.source_dims.z, 0.0, 1.0);

	if (ascii_mix <= 0.001) {
		return vec4<f32>(original_color, 1.0);
	}

	var brightness = clamp(dot(cell_color, vec3<f32>(0.3, 0.59, 0.11)), 0.0, 1.0);
	brightness = clamp((brightness - 0.5) * max(params.canvas_dims.w, 0.01) + 0.5 + params.canvas_dims.z, 0.0, 1.0);
	let glyph_count = max(params.time_exposure_quality_glyph.w, 1.0);
	let glyph_index = clamp(floor(brightness * (glyph_count - 1.0) + 0.5), 0.0, glyph_count - 1.0);
	let atlas_uv = vec2<f32>((glyph_index + cell_uv.x) / glyph_count, cell_uv.y);
	let glyph = textureSample(glyph_texture, glyph_sampler, atlas_uv).a;
	let glyph_coverage = max(textureLoad(glyph_metrics, vec2<i32>(i32(glyph_index), 0), 0).r, 0.035);
	let normalized_glyph = clamp(glyph / glyph_coverage, 0.0, 2.5);
	let bright_cell_glow = (1.0 - glyph) * smoothstep(0.45, 0.95, brightness) * brightness * 0.32;
	let base_color = select(cell_color, palette_color(brightness), params.cell_size.z > 0.5);
	let ascii_color = clamp(base_color * (0.035 + normalized_glyph * 0.82 + bright_cell_glow), vec3<f32>(0.0), vec3<f32>(1.0));
	return vec4<f32>(mix(original_color, ascii_color, ascii_mix), 1.0);
}
`;

const FALLBACK_CHANNEL_RESOLUTIONS = new Float32Array(12);
const CONTROL_KEY_CODES = new Set([65, 68, 69, 70, 81, 82, 83, 87]);

const MOVE_SPEED = 2.5;
const MOVE_SPEED_FACTOR = 1.25;
const MOUSE_SENSITIVITY = 0.003;
const ROLL_SPEED = 2.0;
const FRAME_TARGET_MS = 22;
const MIN_RENDER_SCALE = 0.01;
const MIN_DPR = 0.01;
const MIN_TEXT_SIZE = 1;
const MIN_QUALITY_VALUE = 0.01;
const MAX_GLYPH_ATLAS_DIMENSION = 4096;
const MIN_PREPASS_SCALE = MIN_RENDER_SCALE;
const DIRECT_FALLBACK_DPR = 0.85;
const TARGET_ALLOCATION_SCALE_STEPS = [1, 0.75, 0.5, 0.35, 0.25] as const;
const IDLE_PREPASS_STRIDE = 4;
const ACTIVE_PREPASS_STRIDE = 2;
const BLOOM_FRAME_STRIDE = 3;
const DEFAULT_IDLE_RENDER_INTERVAL_MS = 24;
const DEFAULT_ASCII_CELL_SIZE: AsciiCellSize = { x: 6, y: 9 };
const DEFAULT_ASCII_CELL_FRAME_INTERVAL_MS = 33;
const MAX_GLYPHS = 96;
const GLYPH_PRESETS: Record<Exclude<GlyphPreset, "custom">, string> = {
	gargantua: " CGO08@",
	classic: " .:-=+*#%@",
	dense:
		" .'`,^\":;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
};
const FONT_OPTIONS: FontFamily[] = [
	"Departure Mono",
	"DSEG14Modern",
	"Menlo",
	"Courier New",
	"monospace",
];
const DEFAULT_SHADER_CONTROLS: ShaderControls = {
	timeScale: 2,
	exposure: 2,
	bloomStrength: 0,
	temporalJitter: 0,
	invertControls: false,
	paletteMode: "source",
	shadowColor: "#08162d",
	midColor: "#35c7ff",
	highlightColor: "#fffaf2",
	glyphPreset: "custom",
	customGlyphs: "voidCG08AA",
	fontFamily: "Departure Mono",
	textSize: 9,
	brightness: 0,
	contrast: 1,
};
const DEFAULT_RENDER_UNIFORMS: RenderUniforms = {
	asciiCellSize: DEFAULT_ASCII_CELL_SIZE,
	asciiMix: 1,
	glyphCount: 10,
	temporalJitter: 0,
	exposure: 2,
	bloomStrength: 0,
	asciiBrightness: 0,
	asciiContrast: 1,
	paletteMode: 0,
	shadowColor: [0.031, 0.086, 0.176],
	midColor: [0.207, 0.78, 1],
	highlightColor: [1, 0.98, 0.949],
};

function glyphControlsKey(controls: ShaderControls): string {
	return [
		controls.glyphPreset,
		controls.customGlyphs,
		controls.fontFamily,
		controls.textSize,
	].join("\n");
}

function add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v: Vec3, s: number): Vec3 {
	return [v[0] * s, v[1] * s, v[2] * s];
}

function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}

function length(v: Vec3): number {
	return Math.hypot(v[0], v[1], v[2]);
}

function copyVec3Into(target: Vec3, source: Vec3): Vec3 {
	target[0] = source[0];
	target[1] = source[1];
	target[2] = source[2];
	return target;
}

function cloneVec3(source: Vec3): Vec3 {
	return [source[0], source[1], source[2]];
}

function normalizeInto(target: Vec3, source: Vec3): Vec3 {
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

function crossInto(target: Vec3, a: Vec3, b: Vec3): Vec3 {
	const x = a[1] * b[2] - a[2] * b[1];
	const y = a[2] * b[0] - a[0] * b[2];
	const z = a[0] * b[1] - a[1] * b[0];
	target[0] = x;
	target[1] = y;
	target[2] = z;
	return target;
}

function normalize(v: Vec3): Vec3 {
	const magnitude = length(v);
	if (magnitude < 1e-9) return [0, 0, 0];
	return scale(v, 1 / magnitude);
}

function rotateAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
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

function coerceVec3(value: Vec3 | undefined, fallback: Vec3): Vec3 {
	if (!value || value.some((component) => !Number.isFinite(component))) {
		return [...fallback];
	}

	return [value[0], value[1], value[2]];
}

function createInitialCamera({
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

function setCameraForward(camera: CameraState, forward: Vec3) {
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

function formatCameraNumber(value: number): string {
	const normalizedValue = Math.abs(value) < 0.0005 ? 0 : value;
	return normalizedValue.toFixed(3);
}

function formatCameraVec3(value: Vec3): string {
	return `[${value.map(formatCameraNumber).join(", ")}]`;
}

function parseCameraVec3(value: string): Vec3 | null {
	const matches = value.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi);
	if (!matches || matches.length !== 3) return null;

	const parsed = matches.map(Number);
	if (parsed.some((component) => !Number.isFinite(component))) return null;

	return [parsed[0], parsed[1], parsed[2]];
}

function parseUniverseSign(value: string): number | null {
	const parsed = Number(value.trim());
	if (!Number.isFinite(parsed)) return null;
	return parsed < 0 ? -1 : 1;
}

function cameraDefaultsKey(
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

function lerpNumber(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function lerpVec3Into(target: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
	target[0] = lerpNumber(a[0], b[0], t);
	target[1] = lerpNumber(a[1], b[1], t);
	target[2] = lerpNumber(a[2], b[2], t);
	return target;
}

function catmullRomVec3Into(
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

function smootherStep(t: number): number {
	const x = clamp(t, 0, 1);
	return x * x * x * (x * (x * 6 - 15) + 10);
}

function easeAnimationValue(
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

function keyframeDuration(frame: BlackHoleAnimationKeyframe): number {
	return Math.max(0.001, finiteNumber(frame.duration, 0.001));
}

function animationLoopDuration(sequence: BlackHoleAnimationKeyframe[]): number {
	if (sequence.length < 2) return 0;
	let total = keyframeDuration(sequence[0]);
	for (let index = 1; index < sequence.length; index += 1) {
		total += keyframeDuration(sequence[index]);
	}
	return total;
}

function animationOneShotDuration(
	sequence: BlackHoleAnimationKeyframe[],
): number {
	if (sequence.length < 2) return 0;
	let total = 0;
	for (let index = 1; index < sequence.length; index += 1) {
		total += keyframeDuration(sequence[index]);
	}
	return total;
}

function modularIndex(index: number, lengthValue: number): number {
	return ((index % lengthValue) + lengthValue) % lengthValue;
}

function numberVisualValue(
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

function discreteVisualValue<T>(
	previous: T | undefined,
	next: T | undefined,
	t: number,
): T | undefined {
	if (previous === undefined && next === undefined) return undefined;
	return t >= 0.999 ? (next ?? previous) : (previous ?? next);
}

function interpolateAnimationSegmentInto(
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

function copyAnimationFrameInto(
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

function evaluateAnimationSequenceInto(
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

function writeAnimationControlsFromFrame(
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

function applyAnimationCamera(
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

function animationKeyframeFromCamera(
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

function framesRoughlyEqual(
	a: BlackHoleAnimationKeyframe,
	b: BlackHoleAnimationKeyframe,
): boolean {
	return (
		length(subtract(a.position, b.position)) < 0.001 &&
		length(subtract(a.forward, b.forward)) < 0.001 &&
		a.universeSign === b.universeSign
	);
}

function buildRouteTransitionSequence(
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

function stringifyAnimationValue(value: unknown): string {
	return JSON.stringify(value, null, "\t");
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) ? Number(value) : fallback;
}

function floorNumber(
	value: number | undefined,
	floor: number,
	fallback = floor,
): number {
	const nextValue = finiteNumber(value, fallback);
	return nextValue < floor ? floor : nextValue;
}

function sanitizeGlyphs(value: string): string {
	const glyphs = Array.from(
		value.trim().length > 0 ? value : GLYPH_PRESETS.gargantua,
	);
	const unique: string[] = [];
	const seen = new Set<string>();

	if (!seen.has(" ")) {
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

function glyphsForControls(controls: ShaderControls): string {
	if (controls.glyphPreset === "custom") {
		return sanitizeGlyphs(controls.customGlyphs);
	}

	return sanitizeGlyphs(GLYPH_PRESETS[controls.glyphPreset]);
}

function cellSizeForText(textSize: number, glyphCount: number): AsciiCellSize {
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

function createGlyphAtlasConfig(controls: ShaderControls): GlyphAtlasConfig {
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

function createGlyphAtlasRaster(config: GlyphAtlasConfig): GlyphAtlasRaster {
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

	for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex++) {
		let alphaSum = 0;
		const minX = glyphIndex * config.cellSize.x;
		const maxX = Math.min(width, minX + config.cellSize.x);

		for (let y = 0; y < height; y++) {
			for (let x = minX; x < maxX; x++) {
				alphaSum += imageData.data[(y * width + x) * 4 + 3] ?? 0;
			}
		}

		const coverage = clamp(alphaSum / (255 * cellArea), 0, 1);
		const offset = glyphIndex * 4;
		metricsData.data[offset] = Math.round(coverage * 255);
		metricsData.data[offset + 1] = 255;
		metricsData.data[offset + 2] = 255;
		metricsData.data[offset + 3] = 255;
	}

	metricsContext.putImageData(metricsData, 0, 0);

	return { canvas, metricsCanvas };
}

function normalizeHexColor(value: string, fallback: string): string {
	if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
	return fallback;
}

function hexToVec3(value: string, fallback: string): Vec3 {
	const hex = normalizeHexColor(value, fallback);
	const numberValue = Number.parseInt(hex.slice(1), 16);
	return [
		((numberValue >> 16) & 255) / 255,
		((numberValue >> 8) & 255) / 255,
		(numberValue & 255) / 255,
	];
}

function writeHexToVec3(target: Vec3, value: string, fallback: string): Vec3 {
	const hex = normalizeHexColor(value, fallback);
	const numberValue = Number.parseInt(hex.slice(1), 16);
	target[0] = ((numberValue >> 16) & 255) / 255;
	target[1] = ((numberValue >> 8) & 255) / 255;
	target[2] = (numberValue & 255) / 255;
	return target;
}

function createInitialControls(props: Props): ShaderControls {
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

function createRenderUniforms(
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

function writeRenderUniforms(
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

function isControlKeyboardTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return Boolean(
		target.closest("[data-black-hole-control]") ||
			target.isContentEditable ||
			["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName),
	);
}

function resolveQualitySettings({
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
			qualityValue: 0.48,
			initialPrepassScale: floorNumber(prepassScale ?? 0.18, MIN_PREPASS_SCALE),
			bloomScale: floorNumber(bloomScale ?? 0.12, MIN_RENDER_SCALE),
			sceneScale: floorNumber(sceneScale ?? 0.22, MIN_RENDER_SCALE),
			maxDevicePixelRatio: floorNumber(maxDevicePixelRatio ?? 0.6, MIN_DPR),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 0.8),
			...extras,
			cellWidth: floorNumber(cellWidth ?? 7, 2),
			cellHeight: floorNumber(cellHeight ?? 11, 2),
			frameIntervalMs: floorNumber(frameIntervalMs ?? 50, 0),
			enableBloomPass: enableBloomPass ?? false,
		};
	}

	if (quality === "ascii-balanced") {
		return {
			qualityValue: 0.58,
			initialPrepassScale: floorNumber(prepassScale ?? 0.22, MIN_PREPASS_SCALE),
			bloomScale: floorNumber(bloomScale ?? 0.18, MIN_RENDER_SCALE),
			sceneScale: floorNumber(sceneScale ?? 0.28, MIN_RENDER_SCALE),
			maxDevicePixelRatio: floorNumber(maxDevicePixelRatio ?? 0.85, MIN_DPR),
			resolutionScale: floorNumber(resolutionScale, MIN_RENDER_SCALE, 1),
			...extras,
			cellWidth: floorNumber(cellWidth ?? 6, 2),
			cellHeight: floorNumber(cellHeight ?? 9, 2),
			frameIntervalMs: floorNumber(frameIntervalMs ?? 33, 0),
			enableBloomPass: enableBloomPass ?? false,
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

function qualityPresetFromProp(
	quality: QualityProp | undefined,
): QualityPreset {
	return typeof quality === "string" ? quality : "custom";
}

function defaultQualityPresetForRuntime(): Exclude<QualityPreset, "custom"> {
	if (typeof window === "undefined") return "ascii-balanced";
	const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
	const narrowViewport = Math.min(window.innerWidth, window.innerHeight) <= 768;
	return coarsePointer || narrowViewport ? "mobile-safe" : "ascii-balanced";
}

function createRenderSettingsFromQuality({
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

function createPresetRenderSettings(
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

function resolveRenderSettings(settings: RenderSettings) {
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

function detectRuntimeProfile(): RuntimeProfile {
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

function resolveRendererMode(mode: RendererMode): ResolvedRendererMode {
	if (mode === "full" || mode === "fallback-full") return "full";
	return "full";
}

function isWebGpuAvailable(): boolean {
	return typeof navigator !== "undefined" && "gpu" in navigator;
}

function resolveShaderBackend(
	backend: ShaderBackend,
	resolvedMode: ResolvedRendererMode,
): ResolvedShaderBackend {
	if (backend === "webgpu") return "webgpu";
	if (
		backend === "auto" &&
		resolvedMode === "ascii-cell" &&
		isWebGpuAvailable()
	)
		return "webgpu";
	return "webgl2";
}

function estimateTextureMemoryBytes(
	width: number,
	height: number,
	bytesPerPixel: number,
	count = 1,
): number {
	return Math.max(0, width) * Math.max(0, height) * bytesPerPixel * count;
}

function benchmarkP95(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
	return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
}

function cleanShaderSource(name: string, source: string): string {
	let cleaned = source.replace(/\r\n/g, "\n");

	if (name === "Buffer A" || name === "Black Hole Core") {
		cleaned = cleaned
			.replace(/^\s*vec2\s+iResolution\s*=\s*iResolution\.xy;\s*$/m, "")
			.replace(/^#define iPrepass\s+0.*$/m, "#define iPrepass                1")
			.replace(
				/^#define iEnableShadowCulling\s+0.*$/m,
				"#define iEnableShadowCulling    0",
			)
			.replace(
				/^#define iQuality\s+1\.0.*$/m,
				"#define iQuality                uQuality",
			)
			.replace(
				/^#define iBlendWeight\s+0\.5.*$/m,
				"#define iBlendWeight            uBlendWeight",
			);
	}

	return cleaned;
}

function getBlackHoleCoreSource(): string {
	const marker = "// SECTION 9: mainImage";
	const index = bufferASource.indexOf(marker);
	if (index < 0) throw new Error("Could not locate Buffer A mainImage marker.");
	return cleanShaderSource("Black Hole Core", bufferASource.slice(0, index));
}

function createStandardFragmentSource(
	name: string,
	shaderBody: string,
): string {
	return `${FRAGMENT_HEADER}
out vec4 shadertoyFragColor;

${cleanShaderSource(name, shaderBody)}

void main() {
	mainImage(shadertoyFragColor, gl_FragCoord.xy);
}
`;
}

function createBlackHoleFragmentSource(entrySource: string): string {
	return `${FRAGMENT_HEADER}
${getBlackHoleCoreSource()}
${BLACK_HOLE_HELPERS}
${entrySource}
`;
}

function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
	name: string,
): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error(`Could not create ${name} shader.`);

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
		gl.deleteShader(shader);
		throw new Error(`${name} failed to compile:\n${log}`);
	}

	return shader;
}

function createPass(
	gl: WebGL2RenderingContext,
	name: string,
	fragmentSource: string,
): ProgramPass {
	const vertex = compileShader(
		gl,
		gl.VERTEX_SHADER,
		VERTEX_SOURCE,
		`${name} vertex`,
	);
	const fragment = compileShader(
		gl,
		gl.FRAGMENT_SHADER,
		fragmentSource,
		`${name} fragment`,
	);
	const program = gl.createProgram();

	if (!program) throw new Error(`Could not create ${name} program.`);

	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program) || "Unknown program link error.";
		gl.deleteProgram(program);
		throw new Error(`${name} failed to link:\n${log}`);
	}

	return {
		name,
		program,
		locations: {
			position: gl.getAttribLocation(program, "aPosition"),
			iResolution: gl.getUniformLocation(program, "iResolution"),
			iTime: gl.getUniformLocation(program, "iTime"),
			iTimeDelta: gl.getUniformLocation(program, "iTimeDelta"),
			iFrame: gl.getUniformLocation(program, "iFrame"),
			iMouse: gl.getUniformLocation(program, "iMouse"),
			iChannelResolution: gl.getUniformLocation(
				program,
				"iChannelResolution[0]",
			),
			iChannels: [0, 1, 2, 3].map((channel) =>
				gl.getUniformLocation(program, `iChannel${channel}`),
			),
			uCameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
			uCameraRight: gl.getUniformLocation(program, "uCameraRight"),
			uCameraUp: gl.getUniformLocation(program, "uCameraUp"),
			uUniverseSign: gl.getUniformLocation(program, "uUniverseSign"),
			uQuality: gl.getUniformLocation(program, "uQuality"),
			uTemporalJitter: gl.getUniformLocation(program, "uTemporalJitter"),
			uBlendWeight: gl.getUniformLocation(program, "uBlendWeight"),
			uBloomMode: gl.getUniformLocation(program, "uBloomMode"),
			uCanvasResolution: gl.getUniformLocation(program, "uCanvasResolution"),
			uAsciiCellSize: gl.getUniformLocation(program, "uAsciiCellSize"),
			uAsciiMix: gl.getUniformLocation(program, "uAsciiMix"),
			uGlyphCount: gl.getUniformLocation(program, "uGlyphCount"),
			uAsciiBrightness: gl.getUniformLocation(program, "uAsciiBrightness"),
			uAsciiContrast: gl.getUniformLocation(program, "uAsciiContrast"),
			uPaletteMode: gl.getUniformLocation(program, "uPaletteMode"),
			uShadowColor: gl.getUniformLocation(program, "uShadowColor"),
			uMidColor: gl.getUniformLocation(program, "uMidColor"),
			uHighlightColor: gl.getUniformLocation(program, "uHighlightColor"),
			uExposure: gl.getUniformLocation(program, "uExposure"),
			uBloomStrength: gl.getUniformLocation(program, "uBloomStrength"),
		},
	};
}

function chooseFloatTextureFormat(
	gl: WebGL2RenderingContext,
): TextureFormat | null {
	const canRenderFloat = gl.getExtension("EXT_color_buffer_float");
	if (!canRenderFloat) return null;

	return {
		internalFormat: gl.RGBA16F,
		format: gl.RGBA,
		type: gl.HALF_FLOAT,
		canFilterLinear: Boolean(gl.getExtension("OES_texture_float_linear")),
	};
}

function chooseByteTextureFormat(gl: WebGL2RenderingContext): TextureFormat {
	return {
		internalFormat: gl.RGBA8,
		format: gl.RGBA,
		type: gl.UNSIGNED_BYTE,
		canFilterLinear: true,
	};
}

function chooseFallbackTextureFormat(
	gl: WebGL2RenderingContext,
): TextureFormat {
	return chooseByteTextureFormat(gl);
}

function formatGlError(gl: WebGL2RenderingContext, error: number): string {
	switch (error) {
		case gl.INVALID_ENUM:
			return "INVALID_ENUM";
		case gl.INVALID_VALUE:
			return "INVALID_VALUE";
		case gl.INVALID_OPERATION:
			return "INVALID_OPERATION";
		case gl.INVALID_FRAMEBUFFER_OPERATION:
			return "INVALID_FRAMEBUFFER_OPERATION";
		case gl.OUT_OF_MEMORY:
			return "OUT_OF_MEMORY";
		case gl.CONTEXT_LOST_WEBGL:
			return "CONTEXT_LOST_WEBGL";
		default:
			return `0x${error.toString(16)}`;
	}
}

function clearGlErrors(gl: WebGL2RenderingContext) {
	for (let i = 0; i < 16; i++) {
		if (gl.getError() === gl.NO_ERROR) return;
	}
}

function createRenderTarget(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	format: TextureFormat,
	filter: "linear" | "nearest",
): RenderTarget {
	const texture = gl.createTexture();
	const framebuffer = gl.createFramebuffer();

	if (!texture || !framebuffer) {
		if (texture) gl.deleteTexture(texture);
		if (framebuffer) gl.deleteFramebuffer(framebuffer);
		throw new Error(`Could not create render target (${width}x${height}).`);
	}

	const glFilter =
		filter === "linear" && format.canFilterLinear ? gl.LINEAR : gl.NEAREST;
	clearGlErrors(gl);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		format.internalFormat,
		width,
		height,
		0,
		format.format,
		format.type,
		null,
	);
	const textureError = gl.getError();
	if (textureError !== gl.NO_ERROR) {
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.deleteTexture(texture);
		gl.deleteFramebuffer(framebuffer);
		throw new Error(
			`Could not allocate render target texture (${width}x${height}, ${formatGlError(
				gl,
				textureError,
			)}).`,
		);
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	gl.framebufferTexture2D(
		gl.FRAMEBUFFER,
		gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D,
		texture,
		0,
	);
	gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

	if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.deleteTexture(texture);
		gl.deleteFramebuffer(framebuffer);
		throw new Error(
			`Render target framebuffer is incomplete (${width}x${height}).`,
		);
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return { texture, framebuffer, width, height };
}

function createMultiRenderTarget(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	format: TextureFormat,
	count: number,
): MultiRenderTarget {
	const framebuffer = gl.createFramebuffer();
	if (!framebuffer)
		throw new Error("Could not create multi render target framebuffer.");

	const textures: TextureLike[] = [];
	const attachments: number[] = [];

	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	clearGlErrors(gl);

	try {
		for (let i = 0; i < count; i++) {
			const texture = gl.createTexture();
			if (!texture)
				throw new Error(
					`Could not create multi render target texture ${i + 1}/${count} (${width}x${height}).`,
				);
			textures.push({ texture, width, height });

			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				format.internalFormat,
				width,
				height,
				0,
				format.format,
				format.type,
				null,
			);
			const textureError = gl.getError();
			if (textureError !== gl.NO_ERROR) {
				throw new Error(
					`Could not allocate multi render target texture ${i + 1}/${count} (${width}x${height}, ${formatGlError(
						gl,
						textureError,
					)}).`,
				);
			}

			const attachment = gl.COLOR_ATTACHMENT0 + i;
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				attachment,
				gl.TEXTURE_2D,
				texture,
				0,
			);
			attachments.push(attachment);
		}

		gl.drawBuffers(attachments);

		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
			throw new Error("Prepass MRT framebuffer is incomplete.");
		}
	} catch (error) {
		textures.forEach((item) => {
			gl.deleteTexture(item.texture);
		});
		gl.deleteFramebuffer(framebuffer);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
		throw error;
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return {
		framebuffer,
		textures,
		width,
		height,
		dispose: () => {
			textures.forEach((item) => {
				gl.deleteTexture(item.texture);
			});
			gl.deleteFramebuffer(framebuffer);
		},
	};
}

function createPingPongTarget(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	format: TextureFormat,
	filter: "linear" | "nearest",
): PingPongTarget {
	const initialRead = createRenderTarget(gl, width, height, format, filter);

	try {
		const initialWrite = createRenderTarget(gl, width, height, format, filter);
		let read = initialRead;
		let write = initialWrite;

		return {
			get read() {
				return read;
			},
			get write() {
				return write;
			},
			swap: () => {
				const nextRead = write;
				write = read;
				read = nextRead;
			},
			dispose: () => {
				disposeRenderTarget(gl, read);
				disposeRenderTarget(gl, write);
			},
		};
	} catch (error) {
		disposeRenderTarget(gl, initialRead);
		throw error;
	}
}

function disposeRenderTarget(
	gl: WebGL2RenderingContext,
	target: RenderTarget | null,
) {
	if (!target) return;
	gl.deleteTexture(target.texture);
	gl.deleteFramebuffer(target.framebuffer);
}

function createSolidTexture(
	gl: WebGL2RenderingContext,
	rgba: [number, number, number, number],
): TextureLike {
	const texture = gl.createTexture();
	if (!texture) throw new Error("Could not create fallback texture.");

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA8,
		1,
		1,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		new Uint8Array(rgba),
	);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return { texture, width: 1, height: 1 };
}

function createKeyboardTexture(
	gl: WebGL2RenderingContext,
	data: Uint8Array,
): TextureLike {
	const texture = gl.createTexture();
	if (!texture) throw new Error("Could not create keyboard texture.");

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA8,
		256,
		1,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		data,
	);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return { texture, width: 256, height: 1 };
}

function createCanvasTexture(
	gl: WebGL2RenderingContext,
	canvas: HTMLCanvasElement,
	filter: number,
	flipY: boolean,
	errorMessage: string,
): TextureLike {
	const texture = gl.createTexture();

	if (!texture) throw new Error(errorMessage);

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return { texture, width: canvas.width, height: canvas.height };
}

function createGlyphTextureSet(
	gl: WebGL2RenderingContext,
	config: GlyphAtlasConfig,
): GlyphTextureSet {
	const raster = createGlyphAtlasRaster(config);
	const atlas = createCanvasTexture(
		gl,
		raster.canvas,
		gl.LINEAR,
		true,
		"Could not create ASCII glyph atlas texture.",
	);

	try {
		const metrics = createCanvasTexture(
			gl,
			raster.metricsCanvas,
			gl.NEAREST,
			false,
			"Could not create ASCII glyph metrics texture.",
		);

		return {
			atlas,
			metrics,
			dispose: () => {
				gl.deleteTexture(atlas.texture);
				gl.deleteTexture(metrics.texture);
			},
		};
	} catch (error) {
		gl.deleteTexture(atlas.texture);
		throw error;
	}
}

function updateKeyboardTexture(
	gl: WebGL2RenderingContext,
	keyboard: TextureLike,
	data: Uint8Array,
) {
	gl.bindTexture(gl.TEXTURE_2D, keyboard.texture);
	gl.texSubImage2D(
		gl.TEXTURE_2D,
		0,
		0,
		0,
		256,
		1,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		data,
	);
	gl.bindTexture(gl.TEXTURE_2D, null);
}

function hasActiveControls(
	keyboardData: Uint8Array,
	pointerActive: boolean,
): boolean {
	if (pointerActive) return true;

	for (const keyCode of CONTROL_KEY_CODES) {
		if (keyboardData[keyCode * 4] > 0) return true;
	}

	return false;
}

function fillChannelResolution(channels: TextureLike[], output: Float32Array) {
	output.set(FALLBACK_CHANNEL_RESOLUTIONS);

	for (let i = 0; i < 4; i++) {
		const channel = channels[i];
		output[i * 3] = channel.width;
		output[i * 3 + 1] = channel.height;
		output[i * 3 + 2] = 1;
	}
}

function renderPass(
	gl: WebGL2RenderingContext,
	pass: ProgramPass,
	vertexBuffer: WebGLBuffer,
	target: RenderTarget | MultiRenderTarget | null,
	width: number,
	height: number,
	time: number,
	delta: number,
	frame: number,
	mouse: Float32Array,
	channels: TextureLike[],
	camera: CameraState,
	qualityValue: number,
	blendWeight: number,
	bloomMode: number,
	channelResolutionScratch: Float32Array,
	renderUniforms: RenderUniforms = DEFAULT_RENDER_UNIFORMS,
	canvasResolution: AsciiCellSize | null = null,
) {
	gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);

	if (target && "textures" in target) {
		gl.drawBuffers(
			target.textures.map((_, index) => gl.COLOR_ATTACHMENT0 + index),
		);
	} else if (target) {
		gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
	} else {
		gl.drawBuffers([gl.BACK]);
	}

	gl.viewport(0, 0, width, height);
	// biome-ignore lint/correctness/useHookAtTopLevel: WebGLRenderingContext.useProgram is not a React hook.
	gl.useProgram(pass.program);

	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
	gl.enableVertexAttribArray(pass.locations.position);
	gl.vertexAttribPointer(pass.locations.position, 2, gl.FLOAT, false, 0, 0);

	if (pass.locations.iResolution)
		gl.uniform3f(pass.locations.iResolution, width, height, 1);
	if (pass.locations.iTime) gl.uniform1f(pass.locations.iTime, time);
	if (pass.locations.iTimeDelta) gl.uniform1f(pass.locations.iTimeDelta, delta);
	if (pass.locations.iFrame) gl.uniform1i(pass.locations.iFrame, frame);
	if (pass.locations.iMouse) gl.uniform4fv(pass.locations.iMouse, mouse);
	if (pass.locations.uCanvasResolution)
		gl.uniform2f(
			pass.locations.uCanvasResolution,
			canvasResolution?.x ?? width,
			canvasResolution?.y ?? height,
		);
	if (pass.locations.uCameraPosition)
		gl.uniform3fv(pass.locations.uCameraPosition, camera.position);
	if (pass.locations.uCameraRight)
		gl.uniform3fv(pass.locations.uCameraRight, camera.right);
	if (pass.locations.uCameraUp)
		gl.uniform3fv(pass.locations.uCameraUp, camera.up);
	if (pass.locations.uUniverseSign)
		gl.uniform1f(pass.locations.uUniverseSign, camera.universeSign);
	if (pass.locations.uQuality)
		gl.uniform1f(pass.locations.uQuality, qualityValue);
	if (pass.locations.uTemporalJitter)
		gl.uniform1f(pass.locations.uTemporalJitter, renderUniforms.temporalJitter);
	if (pass.locations.uBlendWeight)
		gl.uniform1f(pass.locations.uBlendWeight, blendWeight);
	if (pass.locations.uBloomMode)
		gl.uniform1i(pass.locations.uBloomMode, bloomMode);
	if (pass.locations.uAsciiCellSize)
		gl.uniform2f(
			pass.locations.uAsciiCellSize,
			renderUniforms.asciiCellSize.x,
			renderUniforms.asciiCellSize.y,
		);
	if (pass.locations.uAsciiMix)
		gl.uniform1f(pass.locations.uAsciiMix, renderUniforms.asciiMix);
	if (pass.locations.uGlyphCount)
		gl.uniform1i(pass.locations.uGlyphCount, renderUniforms.glyphCount);
	if (pass.locations.uAsciiBrightness)
		gl.uniform1f(
			pass.locations.uAsciiBrightness,
			renderUniforms.asciiBrightness,
		);
	if (pass.locations.uAsciiContrast)
		gl.uniform1f(pass.locations.uAsciiContrast, renderUniforms.asciiContrast);
	if (pass.locations.uPaletteMode)
		gl.uniform1i(pass.locations.uPaletteMode, renderUniforms.paletteMode);
	if (pass.locations.uShadowColor)
		gl.uniform3fv(pass.locations.uShadowColor, renderUniforms.shadowColor);
	if (pass.locations.uMidColor)
		gl.uniform3fv(pass.locations.uMidColor, renderUniforms.midColor);
	if (pass.locations.uHighlightColor)
		gl.uniform3fv(
			pass.locations.uHighlightColor,
			renderUniforms.highlightColor,
		);
	if (pass.locations.uExposure)
		gl.uniform1f(pass.locations.uExposure, renderUniforms.exposure);
	if (pass.locations.uBloomStrength)
		gl.uniform1f(pass.locations.uBloomStrength, renderUniforms.bloomStrength);

	if (pass.locations.iChannelResolution) {
		fillChannelResolution(channels, channelResolutionScratch);
		gl.uniform3fv(pass.locations.iChannelResolution, channelResolutionScratch);
	}

	for (let i = 0; i < 4; i++) {
		gl.activeTexture(gl.TEXTURE0 + i);
		gl.bindTexture(gl.TEXTURE_2D, channels[i].texture);
		if (pass.locations.iChannels[i])
			gl.uniform1i(pass.locations.iChannels[i], i);
	}

	gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function updateCamera(
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

function ControlPanel({
	title,
	icon,
	open,
	onToggle,
	children,
}: {
	title: string;
	icon: ReactNode;
	open: boolean;
	onToggle: () => void;
	children: ReactNode;
}) {
	const ToggleIcon = open ? ChevronDown : ChevronUp;

	return (
		<section
			className="border border-white/15 bg-black/70 text-white shadow-2xl backdrop-blur-md"
			data-black-hole-control
		>
			<button
				type="button"
				className="flex h-9 w-full items-center justify-between gap-3 px-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-white/80 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400"
				onClick={onToggle}
				aria-expanded={open}
				title={open ? `Collapse ${title}` : `Expand ${title}`}
			>
				<span className="flex min-w-0 items-center gap-2">
					<span className="text-cyan-200">{icon}</span>
					<span className="truncate">{title}</span>
				</span>
				<ToggleIcon aria-hidden className="h-4 w-4 shrink-0" />
			</button>
			{open ? (
				<div className="grid gap-3 border-t border-white/10 p-3">
					{children}
				</div>
			) : null}
		</section>
	);
}

function formatNumericInput(value: number): string {
	if (!Number.isFinite(value)) return "";
	if (Number.isInteger(value)) return String(value);
	return String(Number(value.toFixed(4)));
}

function formatMetric(value: number, digits = 1): string {
	if (!Number.isFinite(value)) return "n/a";
	return value.toFixed(digits);
}

function formatBytes(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0 MB";
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function NumberControl({
	label,
	value,
	min,
	step = 0.01,
	onChange,
}: {
	label: string;
	value: number;
	min?: number;
	step?: number;
	onChange: (value: number) => void;
}) {
	const [draftValue, setDraftValue] = useState(() => formatNumericInput(value));

	useEffect(() => {
		setDraftValue(formatNumericInput(value));
	}, [value]);

	const applyDraft = (nextDraft: string) => {
		setDraftValue(nextDraft);
		const parsedValue = Number(nextDraft);
		if (!Number.isFinite(parsedValue)) return;
		onChange(min === undefined ? parsedValue : Math.max(min, parsedValue));
	};

	const syncFromValue = () => {
		const parsedValue = Number(draftValue);
		if (!Number.isFinite(parsedValue)) {
			setDraftValue(formatNumericInput(value));
			return;
		}

		const normalizedValue =
			min === undefined ? parsedValue : Math.max(min, parsedValue);
		onChange(normalizedValue);
		setDraftValue(formatNumericInput(normalizedValue));
	};

	return (
		<label className="grid gap-1 font-mono text-[11px] text-white/70">
			<span>{label}</span>
			<input
				type="number"
				min={min}
				step={step}
				value={draftValue}
				onChange={(event) => applyDraft(event.currentTarget.value)}
				onBlur={syncFromValue}
				className="h-8 border border-white/15 bg-black/80 px-2 text-white outline-none focus:border-cyan-300"
			/>
		</label>
	);
}

function ToggleControl({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center justify-between gap-3 font-mono text-[11px] text-white/70">
			<span>{label}</span>
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.currentTarget.checked)}
				className="h-4 w-4 accent-cyan-300"
			/>
		</label>
	);
}

function SelectControl<Value extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: Value;
	options: Array<{ label: string; value: Value }>;
	onChange: (value: Value) => void;
}) {
	return (
		<label className="grid gap-1 font-mono text-[11px] text-white/70">
			<span>{label}</span>
			<select
				value={value}
				onChange={(event) => onChange(event.currentTarget.value as Value)}
				className="h-8 border border-white/15 bg-black/80 px-2 text-white outline-none focus:border-cyan-300"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}

function ColorControl({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className="grid gap-1 font-mono text-[11px] text-white/70">
			<span>{label}</span>
			<span className="flex h-8 items-center gap-2 border border-white/15 bg-black/80 px-2">
				<input
					type="color"
					value={value}
					onChange={(event) => onChange(event.currentTarget.value)}
					className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0"
					title={label}
				/>
				<span className="text-white/45">{value}</span>
			</span>
		</label>
	);
}

export default function BlackHoleShader({
	className = "",
	showControls = true,
	interactive = true,
	idleRenderIntervalMs = DEFAULT_IDLE_RENDER_INTERVAL_MS,
	forceActiveRender = false,
	rendererMode = "auto",
	backend = "auto",
	quality = "balanced",
	resolutionScale = 1,
	prepassScale,
	bloomScale,
	maxDevicePixelRatio,
	cellWidth,
	cellHeight,
	frameIntervalMs,
	enableBloomPass,
	initialCameraPosition,
	initialCameraForward,
	initialUniverseSign,
	asciiEnabled = true,
	asciiCellSize = DEFAULT_ASCII_CELL_SIZE,
	asciiMix = 1,
	sceneScale,
	timeScale,
	exposure,
	bloomStrength,
	temporalJitter,
	invertControls,
	paletteMode,
	shadowColor,
	midColor,
	highlightColor,
	glyphPreset,
	customGlyphs,
	fontFamily,
	textSize,
	brightness,
	contrast,
	animationMode = "off",
	animationRoute,
	animationAutoplay = true,
	debugStats = false,
}: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const reactRenderCountRef = useRef(0);
	const requestRenderRef = useRef<() => void>(() => {});
	const animationEditorRef = useRef<AnimationEditorApi>({
		play: () => {},
		pause: () => {},
		restartIntro: () => {},
		previewIdle: () => {},
		setRoute: () => {},
		currentKeyframe: () => "",
		routeConfig: () => "",
	});
	const cameraEditorRef = useRef<CameraEditorApi>({
		applyPosition: () => false,
		applyForward: () => false,
		applyUniverse: () => false,
		sync: () => {},
	});
	const cameraPositionInputRef = useRef<HTMLInputElement>(null);
	const cameraForwardInputRef = useRef<HTMLInputElement>(null);
	const cameraUniverseInputRef = useRef<HTMLInputElement>(null);
	const runtimeSnapshotRef = useRef<RuntimeSnapshot>({});
	const initialCameraKey = cameraDefaultsKey(
		initialCameraPosition,
		initialCameraForward,
		initialUniverseSign,
	);
	const initialCameraKeyRef = useRef(initialCameraKey);
	const initialPropsRef = useRef<Props>({
		initialCameraPosition,
		initialCameraForward,
		initialUniverseSign,
		timeScale,
		exposure,
		bloomStrength,
		temporalJitter,
		invertControls,
		paletteMode,
		shadowColor,
		midColor,
		highlightColor,
		glyphPreset,
		customGlyphs,
		fontFamily,
		textSize: textSize ?? asciiCellSize.y,
		brightness,
		contrast,
		cellWidth,
		cellHeight,
		frameIntervalMs,
		enableBloomPass,
	});
	const initialRenderSettingsRef = useRef<RenderSettings>(
		createRenderSettingsFromQuality({
			quality,
			asciiEnabled,
			prepassScale,
			bloomScale,
			sceneScale,
			maxDevicePixelRatio,
			resolutionScale,
			cellWidth,
			cellHeight,
			frameIntervalMs,
			enableBloomPass,
		}),
	);
	const hasFixedPrepassScaleRef = useRef(prepassScale !== undefined);
	const [controls, setControls] = useState<ShaderControls>(() =>
		createInitialControls(initialPropsRef.current),
	);
	const [renderSettings, setRenderSettings] = useState<RenderSettings>(
		initialRenderSettingsRef.current,
	);
	const [rendererModeState, setRendererModeState] =
		useState<RendererMode>(rendererMode);
	const [backendState, setBackendState] = useState<ShaderBackend>(backend);
	const [animationPlaying, setAnimationPlayingState] = useState(
		animationAutoplay && animationMode !== "off",
	);
	const [animationEditorRoute, setAnimationEditorRouteState] =
		useState<BlackHoleAnimationRouteKey>(() =>
			normalizeBlackHoleAnimationRoute(animationRoute),
		);
	const [animationEditorStatus, setAnimationEditorStatus] =
		useState("animation idle");
	const [blackHolePanelOpen, setBlackHolePanelOpen] = useState(true);
	const [asciiPanelOpen, setAsciiPanelOpen] = useState(true);
	const [benchmarkPanelOpen, setBenchmarkPanelOpen] = useState(false);
	const [benchmarkRunning, setBenchmarkRunning] = useState(false);
	const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>(
		[],
	);
	const [error, setError] = useState<string | null>(null);
	const [contextRestoreToken, setContextRestoreToken] = useState(0);
	const controlsRef = useRef(controls);
	const renderSettingsRef = useRef(renderSettings);
	const atlasConfigRef = useRef(createGlyphAtlasConfig(controls));
	const animationModeRef = useRef(animationMode);
	const animationRouteRef = useRef(
		animationRoute ?? animationEditorRoute ?? "/",
	);
	const animationAutoplayRef = useRef(animationAutoplay);
	const animationPlayingRef = useRef(animationPlaying);
	const animationEditorRouteRef = useRef(animationEditorRoute);
	const rendererModeRef = useRef(rendererModeState);
	const backendRef = useRef(backendState);

	reactRenderCountRef.current += 1;
	controlsRef.current = controls;
	renderSettingsRef.current = renderSettings;
	atlasConfigRef.current = createGlyphAtlasConfig(controls);
	animationModeRef.current = animationMode;
	animationAutoplayRef.current = animationAutoplay;
	animationPlayingRef.current = animationPlaying;
	animationEditorRouteRef.current = animationEditorRoute;
	rendererModeRef.current = rendererModeState;
	backendRef.current = backendState;
	animationRouteRef.current =
		animationMode === "editor"
			? animationEditorRoute
			: (animationRoute ??
				(typeof window !== "undefined" ? window.location.pathname : "/"));

	const setAnimationEditorRoute = (route: BlackHoleAnimationRouteKey) => {
		animationEditorRouteRef.current = route;
		setAnimationEditorRouteState(route);
		animationEditorRef.current.setRoute(route);
		requestRenderRef.current();
	};

	const updateControl = <Key extends keyof ShaderControls>(
		key: Key,
		value: ShaderControls[Key],
	) => {
		setControls((current) => ({ ...current, [key]: value }));
		requestRenderRef.current();
	};

	const updateRenderSetting = <Key extends keyof RenderSettings>(
		key: Key,
		value: RenderSettings[Key],
	) => {
		setRenderSettings((current) => ({
			...current,
			qualityPreset:
				key === "qualityPreset" ? (value as QualityPreset) : "custom",
			[key]: value,
		}));
		requestRenderRef.current();
	};

	const applyQualityPreset = (preset: QualityPreset) => {
		setRenderSettings((current) => {
			if (preset === "custom") return { ...current, qualityPreset: "custom" };
			return {
				...current,
				...createPresetRenderSettings(preset, current.asciiEnabled),
				qualityPreset: preset,
			};
		});
		requestRenderRef.current();
	};

	const updateRendererMode = (mode: RendererMode) => {
		setError(null);
		setRendererModeState(mode);
		requestRenderRef.current();
	};

	const updateBackend = (nextBackend: ShaderBackend) => {
		setError(null);
		setBackendState(nextBackend);
		requestRenderRef.current();
	};

	const updateAsciiEnabled = (enabled: boolean) => {
		setRenderSettings((current) => {
			if (current.qualityPreset === "custom") {
				return { ...current, asciiEnabled: enabled };
			}

			return {
				...current,
				...createPresetRenderSettings(current.qualityPreset, enabled),
				asciiEnabled: enabled,
			};
		});
		requestRenderRef.current();
	};

	const applyCameraPositionInput = () => {
		const input = cameraPositionInputRef.current;
		if (!input) return;
		if (animationModeRef.current === "editor") {
			animationEditorRef.current.pause();
		}
		if (!cameraEditorRef.current.applyPosition(input.value)) {
			cameraEditorRef.current.sync();
		}
	};

	const applyCameraForwardInput = () => {
		const input = cameraForwardInputRef.current;
		if (!input) return;
		if (animationModeRef.current === "editor") {
			animationEditorRef.current.pause();
		}
		if (!cameraEditorRef.current.applyForward(input.value)) {
			cameraEditorRef.current.sync();
		}
	};

	const applyCameraUniverseInput = () => {
		const input = cameraUniverseInputRef.current;
		if (!input) return;
		if (animationModeRef.current === "editor") {
			animationEditorRef.current.pause();
		}
		if (!cameraEditorRef.current.applyUniverse(input.value)) {
			cameraEditorRef.current.sync();
		}
	};

	const copyAnimationText = async (label: string, value: string) => {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			setAnimationEditorStatus(`${label} copied`);
		} catch {
			setAnimationEditorStatus(`${label} copy failed`);
		}
	};

	const runBenchmark = async () => {
		if (benchmarkRunning) return;
		setBenchmarkRunning(true);
		setBenchmarkResults([]);
		const previousRendererMode = rendererModeRef.current;
		const previousBackend = backendRef.current;
		const scenarios: Array<{
			label: string;
			rendererMode: RendererMode;
			backend: ShaderBackend;
		}> = [
			{ label: "Full WebGL2", rendererMode: "full", backend: "webgl2" },
			{
				label: "Fallback Full WebGL2",
				rendererMode: "fallback-full",
				backend: "webgl2",
			},
		];
		if (isWebGpuAvailable()) {
			scenarios.push({
				label: "Full WebGPU",
				rendererMode: "full",
				backend: "webgpu",
			});
		}
		const wait = (ms: number) =>
			new Promise((resolve) => window.setTimeout(resolve, ms));
		const results: BenchmarkResult[] = [];

		try {
			for (const scenario of scenarios) {
				window.__blackHoleStats = undefined;
				setRendererModeState(scenario.rendererMode);
				setBackendState(scenario.backend);
				await wait(900);
				const cpuFrameTimes: number[] = [];
				const wallFrameTimes: number[] = [];
				let latestStats: BlackHoleStats | undefined;
				let lastFrame = window.__blackHoleStats?.frame ?? -1;
				let lastFrameSampleTime = performance.now();
				let framesSeen = 0;
				const benchmarkStart = performance.now();

				for (let i = 0; i < 40; i++) {
					await wait(50);
					const sampleTime = performance.now();
					latestStats = window.__blackHoleStats;
					if (!latestStats || latestStats.frame === lastFrame) continue;

					const frameDelta =
						lastFrame >= 0 && latestStats.frame >= lastFrame
							? Math.max(1, latestStats.frame - lastFrame)
							: 1;
					const sampleDelta = sampleTime - lastFrameSampleTime;

					if (lastFrame >= 0 && sampleDelta > 0) {
						wallFrameTimes.push(sampleDelta / frameDelta);
					}
					if (latestStats.frameTimeMs > 0) {
						cpuFrameTimes.push(latestStats.frameTimeMs);
					}

					framesSeen += frameDelta;
					lastFrame = latestStats.frame;
					lastFrameSampleTime = sampleTime;
				}

				const benchmarkElapsedMs = performance.now() - benchmarkStart;
				const averageFrameTimeMs =
					framesSeen > 0
						? benchmarkElapsedMs / framesSeen
						: (latestStats?.averageFrameTimeMs ?? 0);
				const p95FrameTimeMs =
					wallFrameTimes.length > 0
						? benchmarkP95(wallFrameTimes)
						: averageFrameTimeMs;
				const cpuAverageFrameTimeMs =
					cpuFrameTimes.length > 0
						? cpuFrameTimes.reduce((sum, value) => sum + value, 0) /
							cpuFrameTimes.length
						: (latestStats?.frameTimeMs ?? 0);
				const cpuP95FrameTimeMs =
					cpuFrameTimes.length > 0
						? benchmarkP95(cpuFrameTimes)
						: cpuAverageFrameTimeMs;
				const result: BenchmarkResult = {
					label: scenario.label,
					rendererMode: scenario.rendererMode,
					backend: scenario.backend,
					activeMode: latestStats?.mode ?? "unavailable",
					activeBackend: latestStats?.backend ?? "unavailable",
					averageFps: averageFrameTimeMs > 0 ? 1000 / averageFrameTimeMs : 0,
					averageFrameTimeMs,
					p95FrameTimeMs,
					cpuAverageFrameTimeMs,
					cpuP95FrameTimeMs,
					initTimeMs: latestStats?.initTimeMs ?? 0,
					cellCount: latestStats?.cellCount ?? 0,
					passCount: latestStats?.passCount ?? 0,
					computeWorkgroups: latestStats?.computeWorkgroups ?? 0,
					computeInvocations: latestStats?.computeInvocations ?? 0,
					renderTargetPixels:
						(latestStats?.sceneWidth ?? 0) * (latestStats?.sceneHeight ?? 0),
					estimatedTextureMemoryBytes:
						latestStats?.estimatedTextureMemoryBytes ?? 0,
					gpuFrameTimeMs: latestStats?.gpuFrameTimeMs ?? null,
					gpuTimingSupported: latestStats?.gpuTimingSupported ?? false,
					fallbackReason: latestStats?.fallbackReason ?? null,
				};
				results.push(result);
				setBenchmarkResults([...results]);
			}
			window.__blackHoleBenchmark = results;
		} finally {
			setRendererModeState(previousRendererMode);
			setBackendState(previousBackend);
			setBenchmarkRunning(false);
			requestRenderRef.current();
		}
	};

	const handleCameraInputKeyDown = (
		event: ReactKeyboardEvent<HTMLInputElement>,
		apply: () => void,
	) => {
		if (event.key === "Enter") {
			event.preventDefault();
			apply();
			event.currentTarget.blur();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			cameraEditorRef.current.sync();
			event.currentTarget.blur();
		}
	};

	useEffect(() => {
		void contextRestoreToken;

		const initialCameraChanged =
			initialCameraKeyRef.current !== initialCameraKey;
		initialCameraKeyRef.current = initialCameraKey;
		initialPropsRef.current = {
			...initialPropsRef.current,
			initialCameraPosition,
			initialCameraForward,
			initialUniverseSign,
		};

		if (initialCameraChanged) {
			runtimeSnapshotRef.current = {
				shaderTime: runtimeSnapshotRef.current.shaderTime,
				movementSpeed: runtimeSnapshotRef.current.movementSpeed,
			};
		}

		const canvas = canvasRef.current;
		if (!canvas) return;

		const settings = resolveRenderSettings(renderSettings);
		const runtimeProfile = detectRuntimeProfile();
		const resolvedRendererMode = resolveRendererMode(rendererModeState);
		const resolvedBackend = resolveShaderBackend(
			backendState,
			resolvedRendererMode,
		);
		const setupStart = performance.now();

		if (resolvedRendererMode === "ascii-cell" || resolvedBackend === "webgpu") {
			const sourceIsCellGrid = resolvedRendererMode === "ascii-cell";
			let disposed = false;
			let animationFrame = 0;
			let frame = 0;
			let renderWidth = 1;
			let renderHeight = 1;
			let cellTextureWidth = 1;
			let cellTextureHeight = 1;
			let lastTime = performance.now();
			let lastRenderNow = 0;
			let shaderTime = runtimeSnapshotRef.current.shaderTime ?? 0;
			let averageFrameTimeMs = 16.7;
			let cpuAverageFrameTimeMs = 16.7;
			let lastStatsPublish = 0;
			let pointerActive = false;
			let lastPointerX = 0;
			let lastPointerY = 0;
			let contextLost = false;
			let initTimeMs = 0;
			const frameTimes: number[] = [];
			const reducedMotion = window.matchMedia(
				"(prefers-reduced-motion: reduce)",
			);
			const keyboardData = new Uint8Array(256 * 4);
			const mouse = new Float32Array([0, 0, -1, -1]);
			const camera = createInitialCamera({
				position:
					runtimeSnapshotRef.current.cameraPosition ??
					initialPropsRef.current.initialCameraPosition,
				forward:
					runtimeSnapshotRef.current.cameraForward ??
					initialPropsRef.current.initialCameraForward,
				universeSign:
					runtimeSnapshotRef.current.universeSign ??
					initialPropsRef.current.initialUniverseSign,
			});
			const movementSpeed =
				runtimeSnapshotRef.current.movementSpeed ?? MOVE_SPEED;
			let activeAsciiBackend = resolvedBackend;
			let fallbackReason: string | null =
				resolvedBackend === "webgpu" && !isWebGpuAvailable()
					? "WebGPU is not available in this browser."
					: null;

			const snapshotRuntime = (now = performance.now()) => {
				const snapshot = runtimeSnapshotRef.current;
				snapshot.cameraPosition = snapshot.cameraPosition
					? copyVec3Into(snapshot.cameraPosition, camera.position)
					: cloneVec3(camera.position);
				snapshot.cameraForward = snapshot.cameraForward
					? copyVec3Into(snapshot.cameraForward, camera.forward)
					: cloneVec3(camera.forward);
				snapshot.universeSign = camera.universeSign;
				snapshot.shaderTime = shaderTime;
				snapshot.movementSpeed = movementSpeed;
				void now;
			};

			const publishStats = (
				frameTimeMs: number,
				now: number,
				passCount: number,
				estimatedTextureMemoryBytes: number,
				gpuFrameTimeMs: number | null,
				gpuTimingSupported: boolean,
			) => {
				if (!debugStats && !import.meta.env.DEV && !showControls) return;
				if (!showControls && now - lastStatsPublish < 250) return;
				lastStatsPublish = now;
				const activeAtlas = atlasConfigRef.current;
				const activeControls = controlsRef.current;
				const cellCount = cellTextureWidth * cellTextureHeight;
				const computeWorkgroups =
					Math.ceil(cellTextureWidth / 8) * Math.ceil(cellTextureHeight / 8);
				const stats: BlackHoleStats = {
					mode: sourceIsCellGrid ? "ascii-cell" : "webgpu",
					backend: activeAsciiBackend,
					requestedRendererMode: rendererModeState,
					runtimeProfile,
					frame,
					frameTimeMs,
					cpuAverageFrameTimeMs,
					averageFrameTimeMs,
					fps: averageFrameTimeMs > 0 ? 1000 / averageFrameTimeMs : 0,
					reactRenderCount: reactRenderCountRef.current,
					dpr: renderWidth / Math.max(1, canvas.getBoundingClientRect().width),
					targetAllocationScale: 1,
					prepassScale: 0,
					bloomScale: settings.bloomScale,
					sceneScale: settings.sceneScale,
					asciiEnabled: settings.asciiEnabled,
					asciiCellSize: sourceIsCellGrid
						? {
								x: settings.cellWidth,
								y: settings.cellHeight,
							}
						: activeAtlas.cellSize,
					renderWidth,
					renderHeight,
					sceneWidth: cellTextureWidth,
					sceneHeight: cellTextureHeight,
					prepassWidth: cellTextureWidth,
					prepassHeight: cellTextureHeight,
					bloomWidth: 0,
					bloomHeight: 0,
					cameraPosition: [...camera.position],
					cameraForward: [...camera.forward],
					universeSign: camera.universeSign,
					movementSpeed,
					timeScale: activeControls.timeScale,
					exposure: activeControls.exposure,
					bloomStrength: activeControls.bloomStrength,
					temporalJitter: activeControls.temporalJitter,
					invertControls: activeControls.invertControls,
					paletteMode: activeControls.paletteMode,
					glyphCount: activeAtlas.glyphCount,
					fontFamily: activeAtlas.fontFamily,
					textSize: activeAtlas.textSize,
					asciiBrightness: activeControls.brightness,
					asciiContrast: activeControls.contrast,
					shaderTime,
					qualityPreset: settings.qualityPreset,
					qualityValue: settings.qualityValue,
					maxDevicePixelRatio: settings.maxDevicePixelRatio,
					resolutionScale: settings.resolutionScale,
					cellWidth: settings.cellWidth,
					cellHeight: settings.cellHeight,
					cellCount,
					computeWorkgroups,
					computeInvocations: computeWorkgroups * 64,
					frameIntervalMs: settings.frameIntervalMs,
					enableBloomPass: false,
					passCount,
					estimatedTextureMemoryBytes,
					initTimeMs,
					gpuFrameTimeMs,
					gpuTimingSupported,
					webgpuAvailable: isWebGpuAvailable(),
					fallbackReason,
					lastAllocationFailure: null,
					animationMode,
					animationRoute: normalizeBlackHoleAnimationRoute(
						animationRouteRef.current,
					),
					animationPhase: "off",
					animationPlaying: false,
					animationFrameIndex: 0,
					animationSequenceTime: 0,
				};
				window.__blackHoleStats = stats;
				frameTimes.push(frameTimeMs);
				if (frameTimes.length > 180) frameTimes.shift();
			};

			const writeCameraReadout = (force = false) => {
				const activeElement = document.activeElement;
				if (!showControls) return;

				if (
					cameraPositionInputRef.current &&
					(force || activeElement !== cameraPositionInputRef.current)
				) {
					cameraPositionInputRef.current.value = formatCameraVec3(
						camera.position,
					);
				}
				if (
					cameraForwardInputRef.current &&
					(force || activeElement !== cameraForwardInputRef.current)
				) {
					cameraForwardInputRef.current.value = formatCameraVec3(
						camera.forward,
					);
				}
				if (
					cameraUniverseInputRef.current &&
					(force || activeElement !== cameraUniverseInputRef.current)
				) {
					cameraUniverseInputRef.current.value = formatCameraNumber(
						camera.universeSign,
					);
				}
			};

			cameraEditorRef.current = {
				applyPosition: (value: string) => {
					const nextPosition = parseCameraVec3(value);
					if (!nextPosition) {
						writeCameraReadout(true);
						return false;
					}
					camera.position = nextPosition;
					snapshotRuntime();
					writeCameraReadout(true);
					requestRenderRef.current();
					return true;
				},
				applyForward: (value: string) => {
					const nextForward = parseCameraVec3(value);
					if (!nextForward || length(nextForward) <= 1e-9) {
						writeCameraReadout(true);
						return false;
					}
					setCameraForward(camera, nextForward);
					snapshotRuntime();
					writeCameraReadout(true);
					requestRenderRef.current();
					return true;
				},
				applyUniverse: (value: string) => {
					const nextUniverseSign = parseUniverseSign(value);
					if (nextUniverseSign === null) {
						writeCameraReadout(true);
						return false;
					}
					camera.universeSign = nextUniverseSign;
					snapshotRuntime();
					writeCameraReadout(true);
					requestRenderRef.current();
					return true;
				},
				sync: () => writeCameraReadout(true),
			};

			animationEditorRef.current = {
				play: () => {},
				pause: () => {},
				restartIntro: () => {},
				previewIdle: () => {},
				setRoute: () => {},
				currentKeyframe: () =>
					stringifyAnimationValue(
						animationKeyframeFromCamera(camera, controlsRef.current, true, 2.5),
					),
				routeConfig: () => "",
			};

			const setKey = (event: KeyboardEvent, pressed: boolean) => {
				if (!interactive) return;
				if (isControlKeyboardTarget(event.target)) return;
				if (event.keyCode < 0 || event.keyCode > 255) return;
				keyboardData[event.keyCode * 4] = pressed ? 255 : 0;
				requestRenderRef.current();
			};

			const handlePointerDown = (event: PointerEvent) => {
				if (!interactive) return;
				pointerActive = true;
				lastPointerX = event.clientX;
				lastPointerY = event.clientY;
				canvas.setPointerCapture?.(event.pointerId);
				requestRenderRef.current();
			};
			const handlePointerMove = (event: PointerEvent) => {
				if (!interactive || !pointerActive) return;
				const direction = controlsRef.current.invertControls ? -1 : 1;
				camera.pendingYaw -=
					(event.clientX - lastPointerX) * MOUSE_SENSITIVITY * direction;
				camera.pendingPitch -=
					(event.clientY - lastPointerY) * MOUSE_SENSITIVITY * direction;
				lastPointerX = event.clientX;
				lastPointerY = event.clientY;
				requestRenderRef.current();
			};
			const handlePointerUp = (event: PointerEvent) => {
				pointerActive = false;
				canvas.releasePointerCapture?.(event.pointerId);
				requestRenderRef.current();
			};

			const startWebGlAsciiCell = () => {
				const gl = canvas.getContext("webgl2", {
					alpha: false,
					antialias: false,
					depth: false,
					preserveDrawingBuffer: false,
					stencil: false,
				});
				if (!gl) {
					setError("WebGL2 is not available in this browser.");
					return;
				}

				const byteFormat = chooseByteTextureFormat(gl);
				const maxTextureSize = Math.max(
					2,
					Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) ||
						MAX_GLYPH_ATLAS_DIMENSION,
				);
				const vertexBuffer = gl.createBuffer();
				if (!vertexBuffer) {
					setError("Could not create ASCII-cell vertex buffer.");
					return;
				}
				gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
				gl.bufferData(
					gl.ARRAY_BUFFER,
					new Float32Array([-1, -1, 3, -1, -1, 3]),
					gl.STATIC_DRAW,
				);

				const fallbackTexture = createSolidTexture(gl, [0, 0, 0, 255]);
				let glyphAtlasConfig = atlasConfigRef.current;
				let liveGlyphControlsKey = glyphControlsKey(controlsRef.current);
				let glyphTextures = createGlyphTextureSet(gl, glyphAtlasConfig);
				const cellPass = createPass(
					gl,
					"ASCII Cell Trace",
					createBlackHoleFragmentSource(ASCII_CELL_TRACE_SOURCE),
				);
				const asciiPass = createPass(
					gl,
					"ASCII Cell Composite",
					createStandardFragmentSource("ASCII", asciiSource),
				);
				let cellTarget: RenderTarget | null = null;
				const channelResolutionScratch = new Float32Array(12);
				const activeRenderUniforms = createRenderUniforms(
					controlsRef.current,
					glyphAtlasConfig,
					settings.asciiEnabled,
					asciiMix,
				);

				const disposeCellTarget = () => {
					disposeRenderTarget(gl, cellTarget);
					cellTarget = null;
				};

				const resize = () => {
					const rect = canvas.getBoundingClientRect();
					const dpr = Math.min(
						window.devicePixelRatio || 1,
						settings.maxDevicePixelRatio,
					);
					const nextWidth = Math.min(
						maxTextureSize,
						Math.max(
							1,
							Math.floor(rect.width * dpr * settings.resolutionScale),
						),
					);
					const nextHeight = Math.min(
						maxTextureSize,
						Math.max(
							1,
							Math.floor(rect.height * dpr * settings.resolutionScale),
						),
					);
					const nextCellWidth = Math.min(
						maxTextureSize,
						Math.max(1, Math.ceil(nextWidth / Math.max(2, settings.cellWidth))),
					);
					const nextCellHeight = Math.min(
						maxTextureSize,
						Math.max(
							1,
							Math.ceil(nextHeight / Math.max(2, settings.cellHeight)),
						),
					);
					if (
						nextWidth === renderWidth &&
						nextHeight === renderHeight &&
						nextCellWidth === cellTextureWidth &&
						nextCellHeight === cellTextureHeight
					)
						return;
					renderWidth = nextWidth;
					renderHeight = nextHeight;
					cellTextureWidth = nextCellWidth;
					cellTextureHeight = nextCellHeight;
					canvas.width = renderWidth;
					canvas.height = renderHeight;
					disposeCellTarget();
					cellTarget = createRenderTarget(
						gl,
						cellTextureWidth,
						cellTextureHeight,
						byteFormat,
						"nearest",
					);
					frame = 0;
					lastRenderNow = 0;
				};

				const renderFrame = (now: number) => {
					if (disposed || contextLost) return;
					animationFrame = 0;
					const cpuFrameStart = performance.now();
					try {
						resize();
						const targetInterval = reducedMotion.matches
							? Math.max(settings.frameIntervalMs, 120)
							: settings.frameIntervalMs;
						if (
							frame > 0 &&
							targetInterval > 0 &&
							now - lastRenderNow < targetInterval
						) {
							animationFrame = requestAnimationFrame(renderFrame);
							return;
						}
						const delta = Math.min(
							0.1,
							Math.max(0.001, (now - lastTime) / 1000),
						);
						lastTime = now;
						lastRenderNow = now;
						const liveControls = controlsRef.current;
						const nextGlyphControlsKey = glyphControlsKey(liveControls);
						if (nextGlyphControlsKey !== liveGlyphControlsKey) {
							liveGlyphControlsKey = nextGlyphControlsKey;
							glyphTextures.dispose();
							glyphAtlasConfig = createGlyphAtlasConfig(liveControls);
							glyphTextures = createGlyphTextureSet(gl, glyphAtlasConfig);
						}
						writeRenderUniforms(
							activeRenderUniforms,
							liveControls,
							glyphAtlasConfig,
							settings.asciiEnabled,
							asciiMix,
						);
						activeRenderUniforms.asciiCellSize = {
							x: settings.cellWidth,
							y: settings.cellHeight,
						};
						shaderTime += delta * liveControls.timeScale;
						updateCamera(camera, keyboardData, delta, movementSpeed);
						snapshotRuntime(now);
						if (!cellTarget) return;
						gl.disable(gl.DEPTH_TEST);
						gl.disable(gl.BLEND);
						gl.clearColor(0, 0, 0, 1);
						renderPass(
							gl,
							cellPass,
							vertexBuffer,
							cellTarget,
							cellTextureWidth,
							cellTextureHeight,
							shaderTime,
							delta,
							frame,
							mouse,
							[
								fallbackTexture,
								fallbackTexture,
								fallbackTexture,
								fallbackTexture,
							],
							camera,
							settings.qualityValue,
							1,
							0,
							channelResolutionScratch,
							activeRenderUniforms,
							{ x: renderWidth, y: renderHeight },
						);
						renderPass(
							gl,
							asciiPass,
							vertexBuffer,
							null,
							renderWidth,
							renderHeight,
							shaderTime,
							delta,
							frame,
							mouse,
							[
								cellTarget,
								glyphTextures.atlas,
								glyphTextures.metrics,
								fallbackTexture,
							],
							camera,
							settings.qualityValue,
							1,
							0,
							channelResolutionScratch,
							activeRenderUniforms,
						);
						const frameTimeMs = performance.now() - cpuFrameStart;
						cpuAverageFrameTimeMs =
							cpuAverageFrameTimeMs * 0.94 + frameTimeMs * 0.06;
						averageFrameTimeMs =
							averageFrameTimeMs * 0.94 + delta * 1000 * 0.06;
						publishStats(
							frameTimeMs,
							now,
							2,
							estimateTextureMemoryBytes(
								cellTextureWidth,
								cellTextureHeight,
								4,
							) +
								estimateTextureMemoryBytes(
									glyphTextures.atlas.width,
									glyphTextures.atlas.height,
									4,
								) +
								estimateTextureMemoryBytes(
									glyphTextures.metrics.width,
									glyphTextures.metrics.height,
									4,
								),
							null,
							false,
						);
						writeCameraReadout();
						frame += 1;
					} catch (renderError) {
						setError(formatError(renderError));
						disposed = true;
						return;
					}
					if (!document.hidden)
						animationFrame = requestAnimationFrame(renderFrame);
				};

				const requestRender = () => {
					if (
						!disposed &&
						!contextLost &&
						!animationFrame &&
						!document.hidden
					) {
						animationFrame = requestAnimationFrame(renderFrame);
					}
				};
				requestRenderRef.current = requestRender;

				const handleContextLost = (event: Event) => {
					event.preventDefault();
					contextLost = true;
					setError("WebGL context lost. Restoring ASCII-cell renderer...");
				};
				const handleContextRestored = () => {
					contextLost = false;
					setError(null);
					setContextRestoreToken((token) => token + 1);
				};
				const resizeObserver = new ResizeObserver(requestRender);
				resizeObserver.observe(canvas);
				canvas.addEventListener("webglcontextlost", handleContextLost);
				canvas.addEventListener("webglcontextrestored", handleContextRestored);
				initTimeMs = performance.now() - setupStart;
				writeCameraReadout(true);
				requestRender();

				return () => {
					disposed = true;
					snapshotRuntime();
					if (animationFrame) cancelAnimationFrame(animationFrame);
					resizeObserver.disconnect();
					canvas.removeEventListener("webglcontextlost", handleContextLost);
					canvas.removeEventListener(
						"webglcontextrestored",
						handleContextRestored,
					);
					disposeCellTarget();
					gl.deleteProgram(cellPass.program);
					gl.deleteProgram(asciiPass.program);
					gl.deleteBuffer(vertexBuffer);
					gl.deleteTexture(fallbackTexture.texture);
					glyphTextures.dispose();
					delete window.__blackHoleStats;
				};
			};

			const startWebGpuAsciiCell = async () => {
				// biome-ignore lint/suspicious/noExplicitAny: WebGPU DOM types are not available in every TypeScript lib target used by Astro yet.
				const gpuNavigator = navigator as Navigator & { gpu?: any };
				if (!gpuNavigator.gpu)
					throw new Error("WebGPU is not available in this browser.");
				const adapter = await gpuNavigator.gpu.requestAdapter();
				if (!adapter) throw new Error("No WebGPU adapter is available.");
				const timestampSupported = Boolean(
					adapter.features?.has?.("timestamp-query"),
				);
				const device = await adapter.requestDevice();
				// biome-ignore lint/suspicious/noExplicitAny: WebGPU canvas context is intentionally guarded at runtime.
				const context = canvas.getContext("webgpu") as any;
				if (!context)
					throw new Error("Could not create WebGPU canvas context.");
				const presentationFormat = gpuNavigator.gpu.getPreferredCanvasFormat();
				context.configure({
					device,
					format: presentationFormat,
					alphaMode: "opaque",
				});

				const sampler = device.createSampler({
					magFilter: "nearest",
					minFilter: "nearest",
				});
				const uniformBuffer = device.createBuffer({
					size: 44 * 4,
					usage: 0x0040 | 0x0008,
				});
				const computeModule = device.createShaderModule({
					label: "ASCII Cell Compute",
					code: WEBGPU_COMPUTE_SOURCE,
				});
				const renderModule = device.createShaderModule({
					label: "ASCII Cell Render",
					code: WEBGPU_RENDER_SOURCE,
				});
				const computePipeline = await device.createComputePipelineAsync({
					label: "ASCII Cell Compute Pipeline",
					layout: "auto",
					compute: { module: computeModule, entryPoint: "main" },
				});
				const renderPipeline = await device.createRenderPipelineAsync({
					label: "ASCII Cell Render Pipeline",
					layout: "auto",
					vertex: { module: renderModule, entryPoint: "vertex_main" },
					fragment: {
						module: renderModule,
						entryPoint: "fragment_main",
						targets: [{ format: presentationFormat }],
					},
					primitive: { topology: "triangle-list" },
				});
				let glyphAtlasConfig = atlasConfigRef.current;
				let liveGlyphControlsKey = glyphControlsKey(controlsRef.current);
				let glyphRaster = createGlyphAtlasRaster(glyphAtlasConfig);
				let glyphTexture = device.createTexture({
					size: [glyphRaster.canvas.width, glyphRaster.canvas.height, 1],
					format: "rgba8unorm",
					usage: 0x0004 | 0x0002 | 0x0010,
				});
				device.queue.copyExternalImageToTexture(
					{ source: glyphRaster.canvas },
					{ texture: glyphTexture },
					[glyphRaster.canvas.width, glyphRaster.canvas.height],
				);
				let glyphMetricsTexture = device.createTexture({
					size: [
						glyphRaster.metricsCanvas.width,
						glyphRaster.metricsCanvas.height,
						1,
					],
					format: "rgba8unorm",
					usage: 0x0004 | 0x0002 | 0x0010,
				});
				device.queue.copyExternalImageToTexture(
					{ source: glyphRaster.metricsCanvas },
					{ texture: glyphMetricsTexture },
					[glyphRaster.metricsCanvas.width, glyphRaster.metricsCanvas.height],
				);
				// biome-ignore lint/suspicious/noExplicitAny: WebGPU texture shape is browser-provided and experimental here.
				let cellTexture: any = null;
				// biome-ignore lint/suspicious/noExplicitAny: WebGPU bind group shape is browser-provided and experimental here.
				let computeBindGroup: any = null;
				// biome-ignore lint/suspicious/noExplicitAny: WebGPU bind group shape is browser-provided and experimental here.
				let renderBindGroup: any = null;
				const uniformData = new Float32Array(44);

				const writeUniforms = () => {
					const activeControls = controlsRef.current;
					const activeAtlas = glyphAtlasConfig;
					const renderUniforms = createRenderUniforms(
						activeControls,
						activeAtlas,
						settings.asciiEnabled,
						asciiMix,
					);
					uniformData[0] = shaderTime;
					uniformData[1] = renderUniforms.exposure;
					uniformData[2] = settings.qualityValue;
					uniformData[3] = renderUniforms.glyphCount;
					uniformData.set(renderUniforms.shadowColor, 4);
					uniformData[7] = 1;
					uniformData.set(renderUniforms.midColor, 8);
					uniformData[11] = 1;
					uniformData.set(renderUniforms.highlightColor, 12);
					uniformData[15] = 1;
					uniformData[16] = cellTextureWidth;
					uniformData[17] = cellTextureHeight;
					uniformData[18] = renderUniforms.asciiMix;
					uniformData[19] = sourceIsCellGrid ? 1 : 0;
					uniformData[20] = renderWidth;
					uniformData[21] = renderHeight;
					uniformData[22] = renderUniforms.asciiBrightness;
					uniformData[23] = renderUniforms.asciiContrast;
					uniformData[24] = sourceIsCellGrid
						? settings.cellWidth
						: activeAtlas.cellSize.x;
					uniformData[25] = sourceIsCellGrid
						? settings.cellHeight
						: activeAtlas.cellSize.y;
					uniformData[26] = renderUniforms.paletteMode;
					uniformData[27] = renderUniforms.bloomStrength;
					uniformData.set(camera.position, 28);
					uniformData[31] = camera.universeSign;
					uniformData.set(camera.right, 32);
					uniformData[35] = 0;
					uniformData.set(camera.up, 36);
					uniformData[39] = 0;
					uniformData.set(camera.forward, 40);
					uniformData[43] = 0;
					device.queue.writeBuffer(uniformBuffer, 0, uniformData);
				};

				const recreateBindGroups = () => {
					computeBindGroup = device.createBindGroup({
						layout: computePipeline.getBindGroupLayout(0),
						entries: [
							{ binding: 0, resource: cellTexture.createView() },
							{ binding: 1, resource: { buffer: uniformBuffer } },
						],
					});
					renderBindGroup = device.createBindGroup({
						layout: renderPipeline.getBindGroupLayout(0),
						entries: [
							{ binding: 0, resource: cellTexture.createView() },
							{ binding: 1, resource: glyphTexture.createView() },
							{ binding: 2, resource: glyphMetricsTexture.createView() },
							{ binding: 3, resource: sampler },
							{ binding: 4, resource: { buffer: uniformBuffer } },
						],
					});
				};

				const resize = () => {
					const rect = canvas.getBoundingClientRect();
					const dpr = Math.min(
						window.devicePixelRatio || 1,
						settings.maxDevicePixelRatio,
					);
					const nextWidth = Math.max(
						1,
						Math.floor(rect.width * dpr * settings.resolutionScale),
					);
					const nextHeight = Math.max(
						1,
						Math.floor(rect.height * dpr * settings.resolutionScale),
					);
					const nextCellWidth = Math.max(
						1,
						sourceIsCellGrid
							? Math.ceil(nextWidth / Math.max(2, settings.cellWidth))
							: nextWidth,
					);
					const nextCellHeight = Math.max(
						1,
						sourceIsCellGrid
							? Math.ceil(nextHeight / Math.max(2, settings.cellHeight))
							: nextHeight,
					);
					if (
						nextWidth === renderWidth &&
						nextHeight === renderHeight &&
						nextCellWidth === cellTextureWidth &&
						nextCellHeight === cellTextureHeight
					)
						return;
					renderWidth = nextWidth;
					renderHeight = nextHeight;
					cellTextureWidth = nextCellWidth;
					cellTextureHeight = nextCellHeight;
					canvas.width = renderWidth;
					canvas.height = renderHeight;
					cellTexture?.destroy?.();
					cellTexture = device.createTexture({
						size: [cellTextureWidth, cellTextureHeight, 1],
						format: "rgba8unorm",
						usage: 0x0004 | 0x0002 | 0x0008,
					});
					recreateBindGroups();
					frame = 0;
					lastRenderNow = 0;
				};

				const renderFrame = (now: number) => {
					if (disposed) return;
					animationFrame = 0;
					const cpuFrameStart = performance.now();
					try {
						resize();
						const targetInterval = reducedMotion.matches
							? Math.max(settings.frameIntervalMs, 120)
							: settings.frameIntervalMs;
						if (
							frame > 0 &&
							targetInterval > 0 &&
							now - lastRenderNow < targetInterval
						) {
							animationFrame = requestAnimationFrame(renderFrame);
							return;
						}
						const delta = Math.min(
							0.1,
							Math.max(0.001, (now - lastTime) / 1000),
						);
						lastTime = now;
						lastRenderNow = now;
						const liveControls = controlsRef.current;
						const nextGlyphControlsKey = glyphControlsKey(liveControls);
						if (nextGlyphControlsKey !== liveGlyphControlsKey) {
							liveGlyphControlsKey = nextGlyphControlsKey;
							glyphTexture.destroy?.();
							glyphMetricsTexture.destroy?.();
							glyphAtlasConfig = createGlyphAtlasConfig(liveControls);
							glyphRaster = createGlyphAtlasRaster(glyphAtlasConfig);
							glyphTexture = device.createTexture({
								size: [glyphRaster.canvas.width, glyphRaster.canvas.height, 1],
								format: "rgba8unorm",
								usage: 0x0004 | 0x0002 | 0x0010,
							});
							device.queue.copyExternalImageToTexture(
								{ source: glyphRaster.canvas },
								{ texture: glyphTexture },
								[glyphRaster.canvas.width, glyphRaster.canvas.height],
							);
							glyphMetricsTexture = device.createTexture({
								size: [
									glyphRaster.metricsCanvas.width,
									glyphRaster.metricsCanvas.height,
									1,
								],
								format: "rgba8unorm",
								usage: 0x0004 | 0x0002 | 0x0010,
							});
							device.queue.copyExternalImageToTexture(
								{ source: glyphRaster.metricsCanvas },
								{ texture: glyphMetricsTexture },
								[
									glyphRaster.metricsCanvas.width,
									glyphRaster.metricsCanvas.height,
								],
							);
							recreateBindGroups();
						}
						shaderTime += delta * liveControls.timeScale;
						updateCamera(camera, keyboardData, delta, movementSpeed);
						snapshotRuntime(now);
						writeUniforms();
						const commandEncoder = device.createCommandEncoder();
						const computePass = commandEncoder.beginComputePass();
						computePass.setPipeline(computePipeline);
						computePass.setBindGroup(0, computeBindGroup);
						computePass.dispatchWorkgroups(
							Math.ceil(cellTextureWidth / 8),
							Math.ceil(cellTextureHeight / 8),
							1,
						);
						computePass.end();
						const currentTexture = context.getCurrentTexture();
						const renderPass = commandEncoder.beginRenderPass({
							colorAttachments: [
								{
									view: currentTexture.createView(),
									clearValue: { r: 0, g: 0, b: 0, a: 1 },
									loadOp: "clear",
									storeOp: "store",
								},
							],
						});
						renderPass.setPipeline(renderPipeline);
						renderPass.setBindGroup(0, renderBindGroup);
						renderPass.draw(3, 1, 0, 0);
						renderPass.end();
						device.queue.submit([commandEncoder.finish()]);
						const frameTimeMs = performance.now() - cpuFrameStart;
						cpuAverageFrameTimeMs =
							cpuAverageFrameTimeMs * 0.94 + frameTimeMs * 0.06;
						averageFrameTimeMs =
							averageFrameTimeMs * 0.94 + delta * 1000 * 0.06;
						publishStats(
							frameTimeMs,
							now,
							2,
							estimateTextureMemoryBytes(
								cellTextureWidth,
								cellTextureHeight,
								4,
							) +
								estimateTextureMemoryBytes(
									glyphRaster.canvas.width,
									glyphRaster.canvas.height,
									4,
								) +
								estimateTextureMemoryBytes(
									glyphRaster.metricsCanvas.width,
									glyphRaster.metricsCanvas.height,
									4,
								),
							null,
							timestampSupported,
						);
						writeCameraReadout();
						frame += 1;
					} catch (renderError) {
						setError(formatError(renderError));
						disposed = true;
						return;
					}
					if (!document.hidden)
						animationFrame = requestAnimationFrame(renderFrame);
				};

				const requestRender = () => {
					if (!disposed && !animationFrame && !document.hidden) {
						animationFrame = requestAnimationFrame(renderFrame);
					}
				};
				requestRenderRef.current = requestRender;
				initTimeMs = performance.now() - setupStart;
				const resizeObserver = new ResizeObserver(requestRender);
				resizeObserver.observe(canvas);
				writeCameraReadout(true);
				requestRender();

				return () => {
					disposed = true;
					snapshotRuntime();
					if (animationFrame) cancelAnimationFrame(animationFrame);
					resizeObserver.disconnect();
					cellTexture?.destroy?.();
					glyphTexture.destroy?.();
					glyphMetricsTexture.destroy?.();
					device.destroy?.();
					delete window.__blackHoleStats;
				};
			};

			let cleanup: (() => void) | undefined;
			const handleKeyDown = (event: KeyboardEvent) => setKey(event, true);
			const handleKeyUp = (event: KeyboardEvent) => setKey(event, false);

			if (interactive) {
				window.addEventListener("keydown", handleKeyDown);
				window.addEventListener("keyup", handleKeyUp);
				canvas.addEventListener("pointerdown", handlePointerDown);
				canvas.addEventListener("pointermove", handlePointerMove);
				canvas.addEventListener("pointerup", handlePointerUp);
				canvas.addEventListener("pointercancel", handlePointerUp);
			}

			if (resolvedBackend === "webgpu") {
				void startWebGpuAsciiCell()
					.then((nextCleanup) => {
						if (disposed) {
							nextCleanup?.();
							return;
						}
						cleanup = nextCleanup;
						setError(null);
					})
					.catch((webGpuError) => {
						fallbackReason = formatError(webGpuError);
						activeAsciiBackend = "webgl2";
						if (!sourceIsCellGrid) {
							setError(null);
							setBackendState("webgl2");
							return;
						}
						try {
							cleanup = startWebGlAsciiCell();
							setError(null);
						} catch (webGlError) {
							fallbackReason = formatError(webGlError);
							setError(fallbackReason);
						}
					});
			} else {
				try {
					cleanup = startWebGlAsciiCell();
				} catch (webGlError) {
					fallbackReason = formatError(webGlError);
					setError(fallbackReason);
				}
			}

			return () => {
				disposed = true;
				cleanup?.();
				if (animationFrame) cancelAnimationFrame(animationFrame);
				if (interactive) {
					window.removeEventListener("keydown", handleKeyDown);
					window.removeEventListener("keyup", handleKeyUp);
					canvas.removeEventListener("pointerdown", handlePointerDown);
					canvas.removeEventListener("pointermove", handlePointerMove);
					canvas.removeEventListener("pointerup", handlePointerUp);
					canvas.removeEventListener("pointercancel", handlePointerUp);
				}
				requestRenderRef.current = () => {};
				cameraEditorRef.current = {
					applyPosition: () => false,
					applyForward: () => false,
					applyUniverse: () => false,
					sync: () => {},
				};
			};
		}

		const gl = canvas.getContext("webgl2", {
			alpha: false,
			antialias: false,
			depth: false,
			preserveDrawingBuffer: true,
			stencil: false,
		});

		if (!gl) {
			setError("WebGL2 is not available in this browser.");
			return;
		}

		const idleRenderInterval = Math.max(
			0,
			finiteNumber(idleRenderIntervalMs, DEFAULT_IDLE_RENDER_INTERVAL_MS),
		);
		const rootPerfFlagActive = (flag: string) => {
			if (window.location.pathname !== "/") return false;
			return (new URLSearchParams(window.location.search).get("bhPerf") ?? "")
				.split(",")
				.map((value) => value.trim())
				.includes(flag);
		};
		const activeAnimationMode = (): AnimationMode =>
			animationModeRef.current === "route" &&
			rootPerfFlagActive("no-route-animation")
				? "off"
				: animationModeRef.current;
		const activeAnimationAutoplay = () =>
			activeAnimationMode() !== "off" && animationAutoplayRef.current;
		const currentAnimationRoute = () =>
			normalizeBlackHoleAnimationRoute(
				activeAnimationMode() === "editor"
					? animationRouteRef.current
					: window.location.pathname || animationRouteRef.current,
			);
		const persistedAnimationSnapshot =
			activeAnimationMode() === "route"
				? window.__blackHoleAnimationSnapshot
				: undefined;
		const initialAnimationRoute = currentAnimationRoute();
		let shouldStartWithRouteTransition =
			Boolean(persistedAnimationSnapshot) &&
			persistedAnimationSnapshot?.route !== initialAnimationRoute;
		const routeIntroStartFrame =
			activeAnimationMode() === "route" &&
			activeAnimationAutoplay() &&
			!shouldStartWithRouteTransition
				? (getBlackHoleRouteAnimation(initialAnimationRoute).intro[0] ?? null)
				: null;
		let activeAnimationRoute = initialAnimationRoute;

		let disposed = false;
		let animationFrame = 0;
		let frame = 0;
		let mode: "optimized" | "fallback" =
			rendererModeState === "fallback-full" ? "fallback" : "optimized";
		let fallbackReason: string | null =
			rendererModeState === "fallback-full"
				? "Forced fallback renderer selected."
				: null;
		let startTime = performance.now();
		let lastTime = startTime;
		let shaderTime =
			runtimeSnapshotRef.current.shaderTime ??
			persistedAnimationSnapshot?.shaderTime ??
			0;
		let renderWidth = 1;
		let renderHeight = 1;
		let sceneWidth = 1;
		let sceneHeight = 1;
		let prepassWidth = 1;
		let prepassHeight = 1;
		let bloomWidth = 1;
		let bloomHeight = 1;
		let currentDpr = 1;
		let targetAllocationScale = 1;
		let allocationScaleReason: string | null = null;
		let lastAllocationFailure: string | null = null;
		let currentPrepassScale = settings.initialPrepassScale;
		let averageFrameTimeMs = 16.7;
		let cpuAverageFrameTimeMs = 16.7;
		let initTimeMs = 0;
		let lastRenderNow = 0;
		let lastStatsPublish = 0;
		let lastRuntimeSnapshotUpdate = 0;
		let lastPersistentSnapshotUpdate = 0;
		let keyboardDirty = true;
		let pointerActive = false;
		let lastPointerX = 0;
		let lastPointerY = 0;
		let lastCameraReadoutUpdate = 0;
		let movementSpeed =
			runtimeSnapshotRef.current.movementSpeed ??
			persistedAnimationSnapshot?.movementSpeed ??
			MOVE_SPEED;
		const maxTextureSize = Math.max(
			2,
			Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || MAX_GLYPH_ATLAS_DIMENSION,
		);

		const keyboardData = new Uint8Array(256 * 4);
		const mouse = new Float32Array([0, 0, -1, -1]);
		const camera = createInitialCamera({
			position:
				routeIntroStartFrame?.position ??
				runtimeSnapshotRef.current.cameraPosition ??
				persistedAnimationSnapshot?.cameraPosition ??
				initialPropsRef.current.initialCameraPosition,
			forward:
				routeIntroStartFrame?.forward ??
				runtimeSnapshotRef.current.cameraForward ??
				persistedAnimationSnapshot?.cameraForward ??
				initialPropsRef.current.initialCameraForward,
			universeSign:
				routeIntroStartFrame?.universeSign ??
				runtimeSnapshotRef.current.universeSign ??
				persistedAnimationSnapshot?.universeSign ??
				initialPropsRef.current.initialUniverseSign,
		});

		const snapshotRuntime = (
			forcePersistent = false,
			now = performance.now(),
		) => {
			if (!forcePersistent && now - lastRuntimeSnapshotUpdate < 250) return;
			lastRuntimeSnapshotUpdate = now;

			const snapshot = runtimeSnapshotRef.current;
			snapshot.cameraPosition = snapshot.cameraPosition
				? copyVec3Into(snapshot.cameraPosition, camera.position)
				: cloneVec3(camera.position);
			snapshot.cameraForward = snapshot.cameraForward
				? copyVec3Into(snapshot.cameraForward, camera.forward)
				: cloneVec3(camera.forward);
			snapshot.universeSign = camera.universeSign;
			snapshot.shaderTime = shaderTime;
			snapshot.movementSpeed = movementSpeed;

			if (activeAnimationMode() !== "route") return;
			if (
				!forcePersistent &&
				window.__blackHoleAnimationSnapshot &&
				now - lastPersistentSnapshotUpdate < 500
			) {
				return;
			}

			lastPersistentSnapshotUpdate = now;
			const persistent = window.__blackHoleAnimationSnapshot;
			if (persistent) {
				copyVec3Into(persistent.cameraPosition, camera.position);
				copyVec3Into(persistent.cameraForward, camera.forward);
				persistent.universeSign = camera.universeSign;
				persistent.shaderTime = shaderTime;
				persistent.movementSpeed = movementSpeed;
				persistent.route = activeAnimationRoute;
			} else {
				window.__blackHoleAnimationSnapshot = {
					cameraPosition: cloneVec3(camera.position),
					cameraForward: cloneVec3(camera.forward),
					universeSign: camera.universeSign,
					shaderTime,
					movementSpeed,
					route: activeAnimationRoute,
				};
			}
		};
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const floatFormat = chooseFloatTextureFormat(gl);
		const fallbackFormat = chooseFallbackTextureFormat(gl);
		const fallbackTexture = createSolidTexture(gl, [0, 0, 0, 255]);
		const keyboardTexture = createKeyboardTexture(gl, keyboardData);
		let glyphAtlasConfig = atlasConfigRef.current;
		let liveGlyphControlsKey = glyphControlsKey(controlsRef.current);
		let glyphTextures = createGlyphTextureSet(gl, glyphAtlasConfig);
		const vertexBuffer = gl.createBuffer();
		const channelResolutionScratch = new Float32Array(12);

		if (!vertexBuffer) {
			setError("Could not create fullscreen vertex buffer.");
			glyphTextures.dispose();
			gl.deleteTexture(fallbackTexture.texture);
			gl.deleteTexture(keyboardTexture.texture);
			return;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 3, -1, -1, 3]),
			gl.STATIC_DRAW,
		);

		let optimizedPasses: OptimizedPassSet | null = null;
		let fallbackPasses: FallbackPassSet | null = null;
		let optimizedTargets: OptimizedTargets | null = null;
		let fallbackTargets: FallbackTargets | null = null;
		let contextLost = false;

		const ensureFallbackPasses = () => {
			if (fallbackPasses) return;

			fallbackPasses = {
				a: createPass(
					gl,
					"Buffer A",
					createStandardFragmentSource("Buffer A", bufferASource),
				),
				b: createPass(
					gl,
					"Buffer B",
					createStandardFragmentSource("Buffer B", bufferBSource),
				),
				c: createPass(
					gl,
					"Buffer C",
					createStandardFragmentSource("Buffer C", bufferCSource),
				),
				d: createPass(
					gl,
					"Buffer D",
					createStandardFragmentSource("Buffer D", bufferDSource),
				),
				image: createPass(
					gl,
					"Image",
					createStandardFragmentSource("Image", imageSource),
				),
				ascii: createPass(
					gl,
					"ASCII",
					createStandardFragmentSource("ASCII", asciiSource),
				),
			};
		};

		const writeCameraReadout = (force = false) => {
			const activeElement = document.activeElement;
			if (!showControls) return;

			if (
				cameraPositionInputRef.current &&
				(force || activeElement !== cameraPositionInputRef.current)
			) {
				cameraPositionInputRef.current.value = formatCameraVec3(
					camera.position,
				);
			}
			if (
				cameraForwardInputRef.current &&
				(force || activeElement !== cameraForwardInputRef.current)
			) {
				cameraForwardInputRef.current.value = formatCameraVec3(camera.forward);
			}
			if (
				cameraUniverseInputRef.current &&
				(force || activeElement !== cameraUniverseInputRef.current)
			) {
				cameraUniverseInputRef.current.value = formatCameraNumber(
					camera.universeSign,
				);
			}
		};

		const updateCameraReadout = (now: number, force = false) => {
			if (!showControls) return;
			if (!force && now - lastCameraReadoutUpdate < 250) return;
			lastCameraReadoutUpdate = now;
			writeCameraReadout(force);
		};

		cameraEditorRef.current = {
			applyPosition: (value: string) => {
				const nextPosition = parseCameraVec3(value);
				if (!nextPosition) {
					writeCameraReadout(true);
					return false;
				}
				camera.position = nextPosition;
				snapshotRuntime();
				writeCameraReadout(true);
				requestRender();
				return true;
			},
			applyForward: (value: string) => {
				const nextForward = parseCameraVec3(value);
				if (!nextForward || length(nextForward) <= 1e-9) {
					writeCameraReadout(true);
					return false;
				}
				setCameraForward(camera, nextForward);
				snapshotRuntime();
				writeCameraReadout(true);
				requestRender();
				return true;
			},
			applyUniverse: (value: string) => {
				const nextUniverseSign = parseUniverseSign(value);
				if (nextUniverseSign === null) {
					writeCameraReadout(true);
					return false;
				}
				camera.universeSign = nextUniverseSign;
				snapshotRuntime();
				writeCameraReadout(true);
				requestRender();
				return true;
			},
			sync: () => writeCameraReadout(true),
		};

		if (mode === "optimized") {
			try {
				if (!floatFormat)
					throw new Error("EXT_color_buffer_float is unavailable.");

				const testTarget = createMultiRenderTarget(gl, 4, 4, floatFormat, 2);
				testTarget.dispose();

				optimizedPasses = {
					prepass: createPass(
						gl,
						"NPGS prepass",
						createBlackHoleFragmentSource(PREPASS_MAIN),
					),
					composite: createPass(
						gl,
						"NPGS composite",
						createBlackHoleFragmentSource(COMPOSITE_MAIN),
					),
					bloom: createPass(
						gl,
						"NPGS bloom",
						createStandardFragmentSource("NPGS bloom", bloomSource),
					),
					image: createPass(
						gl,
						"Image",
						createStandardFragmentSource("Image", imageSource),
					),
					ascii: createPass(
						gl,
						"ASCII",
						createStandardFragmentSource("ASCII", asciiSource),
					),
				};
			} catch (optimizedError) {
				mode = "fallback";
				fallbackReason = formatError(optimizedError);
			}
		}

		if (mode === "fallback") {
			try {
				ensureFallbackPasses();
			} catch (fallbackError) {
				setError(formatError(fallbackError));
				gl.deleteBuffer(vertexBuffer);
				gl.deleteTexture(fallbackTexture.texture);
				gl.deleteTexture(keyboardTexture.texture);
				glyphTextures.dispose();
				return;
			}
		}

		const disposeOptimizedTargets = () => {
			optimizedTargets?.prepass.dispose();
			optimizedTargets?.composite.dispose();
			disposeRenderTarget(gl, optimizedTargets?.bloomMip ?? null);
			disposeRenderTarget(gl, optimizedTargets?.bloomHorizontal ?? null);
			disposeRenderTarget(gl, optimizedTargets?.bloomVertical ?? null);
			disposeRenderTarget(gl, optimizedTargets?.scene ?? null);
			optimizedTargets = null;
		};

		const disposeFallbackTargets = () => {
			fallbackTargets?.a.dispose();
			fallbackTargets?.b.dispose();
			disposeRenderTarget(gl, fallbackTargets?.c ?? null);
			disposeRenderTarget(gl, fallbackTargets?.d ?? null);
			disposeRenderTarget(gl, fallbackTargets?.scene ?? null);
			fallbackTargets = null;
		};

		const disposeTargets = () => {
			disposeOptimizedTargets();
			disposeFallbackTargets();
		};

		const disposeOptimizedTargetGroup = (
			targets: Partial<OptimizedTargets>,
		) => {
			targets.prepass?.dispose();
			targets.composite?.dispose();
			disposeRenderTarget(gl, targets.bloomMip ?? null);
			disposeRenderTarget(gl, targets.bloomHorizontal ?? null);
			disposeRenderTarget(gl, targets.bloomVertical ?? null);
			disposeRenderTarget(gl, targets.scene ?? null);
		};

		const disposeFallbackTargetGroup = (targets: Partial<FallbackTargets>) => {
			targets.a?.dispose();
			targets.b?.dispose();
			disposeRenderTarget(gl, targets.c ?? null);
			disposeRenderTarget(gl, targets.d ?? null);
			disposeRenderTarget(gl, targets.scene ?? null);
		};

		const syncGlyphAtlasConfig = (nextConfig: GlyphAtlasConfig) => {
			if (nextConfig.key === glyphAtlasConfig.key) return;

			glyphTextures.dispose();
			glyphTextures = createGlyphTextureSet(gl, nextConfig);
			glyphAtlasConfig = nextConfig;
		};

		let animationPhase: AnimationPhase = "off";
		let animationSequence: BlackHoleAnimationKeyframe[] = [];
		let animationSequenceTime = 0;
		let animationSequenceLoops = false;
		let animationFrameIndex = 0;
		let animationSequenceJustStarted = false;
		const scratchAnimationFrame: BlackHoleAnimationKeyframe = {
			duration: 0,
			position: [0, 0, 0],
			forward: [0, 0, -1],
			universeSign: 1,
		};
		const scratchAnimationResult: {
			frame: BlackHoleAnimationKeyframe | null;
			frameIndex: number;
			done: boolean;
			sequenceTime: number;
		} = {
			frame: null,
			frameIndex: 0,
			done: false,
			sequenceTime: 0,
		};
		const lastAnimatedControls: ShaderControls = { ...controlsRef.current };
		let lastAnimatedAsciiEnabled = settings.asciiEnabled;
		let lastAnimationStatus = "";
		const activeRenderUniforms = createRenderUniforms(
			lastAnimatedControls,
			glyphAtlasConfig,
			lastAnimatedAsciiEnabled,
			asciiMix,
		);

		const publishAnimationStatus = (status: string) => {
			if (!showControls || status === lastAnimationStatus) return;
			lastAnimationStatus = status;
			setAnimationEditorStatus(status);
		};

		const setAnimationPlaying = (playing: boolean) => {
			animationPlayingRef.current = playing;
			if (showControls) setAnimationPlayingState(playing);
		};

		const animationIsEnabled = () => activeAnimationMode() !== "off";

		const animationIsOwningCamera = () =>
			animationIsEnabled() &&
			animationPhase !== "off" &&
			(animationPlayingRef.current || animationSequence.length > 0);

		const currentAnimationKeyframe = (duration = 0) =>
			animationKeyframeFromCamera(
				camera,
				lastAnimatedControls,
				lastAnimatedAsciiEnabled,
				duration,
			);

		const setAnimationSequence = ({
			phase,
			route,
			sequence,
			loop,
			playing,
		}: {
			phase: AnimationPhase;
			route: BlackHoleAnimationRouteKey;
			sequence: BlackHoleAnimationKeyframe[];
			loop: boolean;
			playing: boolean;
		}) => {
			activeAnimationRoute = route;
			animationPhase = sequence.length > 0 ? phase : "off";
			animationSequence = sequence.map((frame) => ({ ...frame }));
			animationSequenceTime = 0;
			animationSequenceLoops = loop;
			animationFrameIndex = 0;
			animationSequenceJustStarted = true;
			setAnimationPlaying(playing && animationSequence.length > 0);

			const firstFrame = animationSequence[0] ?? null;
			applyAnimationCamera(camera, firstFrame);
			writeAnimationControlsFromFrame(
				lastAnimatedControls,
				controlsRef.current,
				firstFrame,
			);
			lastAnimatedAsciiEnabled =
				firstFrame?.asciiEnabled ?? settings.asciiEnabled;
			snapshotRuntime();
			writeCameraReadout(true);
			publishAnimationStatus(
				animationPhase === "off"
					? "animation idle"
					: `${activeAnimationRoute} ${animationPhase}`,
			);
		};

		const startIdle = (
			route = activeAnimationRoute,
			playing = activeAnimationAutoplay(),
		) => {
			const config = getBlackHoleRouteAnimation(route);
			setAnimationSequence({
				phase: "idle",
				route,
				sequence: config.idle,
				loop: true,
				playing,
			});
		};

		const startIntro = (
			route = activeAnimationRoute,
			playing = activeAnimationAutoplay(),
		) => {
			const config = getBlackHoleRouteAnimation(route);
			setAnimationSequence({
				phase: "intro",
				route,
				sequence: config.intro,
				loop: false,
				playing,
			});
		};

		const startTransition = (
			route: BlackHoleAnimationRouteKey,
			playing = activeAnimationAutoplay(),
		) => {
			setAnimationSequence({
				phase: "transition",
				route,
				sequence: buildRouteTransitionSequence(
					currentAnimationKeyframe(0),
					route,
				),
				loop: false,
				playing,
			});
		};

		const stopEditorAnimationForManualInput = () => {
			if (activeAnimationMode() !== "editor") return;
			animationPhase = "off";
			animationSequence = [];
			animationSequenceTime = 0;
			animationFrameIndex = 0;
			setAnimationPlaying(false);
			publishAnimationStatus("manual camera");
		};

		const applyReducedMotionAnimation = () => {
			if (!animationIsEnabled()) return;
			const route = currentAnimationRoute();
			const idleFrame = getBlackHoleRouteAnimation(route).idle[0] ?? null;
			activeAnimationRoute = route;
			animationPhase = "idle";
			animationSequence = idleFrame ? [idleFrame] : [];
			animationSequenceTime = 0;
			animationSequenceLoops = false;
			animationFrameIndex = 0;
			setAnimationPlaying(false);
			applyAnimationCamera(camera, idleFrame);
			writeAnimationControlsFromFrame(
				lastAnimatedControls,
				controlsRef.current,
				idleFrame,
			);
			lastAnimatedAsciiEnabled =
				idleFrame?.asciiEnabled ?? settings.asciiEnabled;
			publishAnimationStatus(`${route} reduced motion`);
		};

		const syncAnimationRoute = () => {
			if (!animationIsEnabled()) return;
			const nextRoute = currentAnimationRoute();
			if (activeAnimationMode() === "editor") {
				if (nextRoute !== activeAnimationRoute && animationPhase !== "off") {
					startIntro(nextRoute, animationPlayingRef.current);
				}
				return;
			}

			if (animationPhase === "off" && activeAnimationAutoplay()) {
				if (shouldStartWithRouteTransition) {
					shouldStartWithRouteTransition = false;
					startTransition(nextRoute, true);
					return;
				}
				startIntro(nextRoute, true);
				return;
			}

			if (nextRoute !== activeAnimationRoute) {
				startTransition(nextRoute, activeAnimationAutoplay());
			}
		};

		const finishAnimationPhase = () => {
			if (animationPhase === "transition") {
				startIntro(activeAnimationRoute, activeAnimationAutoplay());
				return;
			}
			if (animationPhase === "intro") {
				startIdle(activeAnimationRoute, activeAnimationAutoplay());
			}
		};

		const evaluateAnimationFrame = (delta: number) => {
			if (!animationIsEnabled()) {
				animationPhase = "off";
				animationSequenceJustStarted = false;
				return {
					controls: controlsRef.current,
					asciiEnabled: settings.asciiEnabled,
					active: false,
				};
			}

			syncAnimationRoute();

			if (reducedMotion.matches) {
				applyReducedMotionAnimation();
			}

			if (animationPlayingRef.current && !animationSequenceJustStarted) {
				animationSequenceTime += delta;
			}
			animationSequenceJustStarted = false;

			const result = evaluateAnimationSequenceInto(
				scratchAnimationResult,
				scratchAnimationFrame,
				{
					sequence: animationSequence,
					time: animationSequenceTime,
					loop: animationSequenceLoops,
					baseControls: controlsRef.current,
					baseAsciiEnabled: settings.asciiEnabled,
				},
			);

			animationFrameIndex = result.frameIndex;
			animationSequenceTime = result.sequenceTime;
			applyAnimationCamera(camera, result.frame);
			writeAnimationControlsFromFrame(
				lastAnimatedControls,
				controlsRef.current,
				result.frame,
			);
			lastAnimatedAsciiEnabled =
				result.frame?.asciiEnabled ?? settings.asciiEnabled;

			if (
				result.done &&
				animationPlayingRef.current &&
				!animationSequenceLoops
			) {
				finishAnimationPhase();
			}

			return {
				controls: lastAnimatedControls,
				asciiEnabled: lastAnimatedAsciiEnabled,
				active: animationPhase !== "off",
			};
		};

		animationEditorRef.current = {
			play: () => {
				if (!animationIsEnabled()) return;
				if (animationPhase === "off") {
					startIntro(
						normalizeBlackHoleAnimationRoute(animationRouteRef.current),
						true,
					);
				} else {
					setAnimationPlaying(true);
					publishAnimationStatus(`${activeAnimationRoute} ${animationPhase}`);
				}
				requestRender();
			},
			pause: () => {
				setAnimationPlaying(false);
				publishAnimationStatus(`${activeAnimationRoute} paused`);
				requestRender();
			},
			restartIntro: () => {
				startIntro(
					normalizeBlackHoleAnimationRoute(animationRouteRef.current),
					true,
				);
				requestRender();
			},
			previewIdle: () => {
				startIdle(
					normalizeBlackHoleAnimationRoute(animationRouteRef.current),
					true,
				);
				requestRender();
			},
			setRoute: (route) => {
				activeAnimationRoute = route;
				if (activeAnimationMode() === "editor") {
					startIntro(route, animationPlayingRef.current);
				}
				requestRender();
			},
			currentKeyframe: () =>
				stringifyAnimationValue(currentAnimationKeyframe(2.5)),
			routeConfig: () =>
				stringifyAnimationValue(
					BLACK_HOLE_ANIMATION_ROUTES[activeAnimationRoute],
				),
		};

		const targetDimension = (value: number) =>
			Math.min(maxTextureSize, Math.max(2, Math.floor(value)));
		const allocatedTargetDimension = (value: number) =>
			targetDimension(value * targetAllocationScale);

		const createTargetsWithRetry = (createTargets: () => void) => {
			let lastError: unknown = null;
			const scaleSteps = TARGET_ALLOCATION_SCALE_STEPS.filter(
				(scale) => scale <= targetAllocationScale + 1e-6,
			);

			for (const scale of scaleSteps) {
				targetAllocationScale = scale;
				disposeTargets();

				try {
					createTargets();
					if (scale === 1) lastAllocationFailure = null;
					allocationScaleReason =
						scale < 1
							? `Render targets reduced to ${Math.round(
									scale * 100,
								)}% after allocation retry.`
							: null;
					return;
				} catch (error) {
					lastError = error;
					lastAllocationFailure = formatError(error);
					disposeTargets();
				}
			}

			throw lastError instanceof Error
				? lastError
				: new Error("Could not allocate render targets.");
		};

		const createOptimizedTargets = () => {
			if (!floatFormat) throw new Error("Float targets are unavailable.");
			const nextSceneWidth = allocatedTargetDimension(
				renderWidth * settings.sceneScale,
			);
			const nextSceneHeight = allocatedTargetDimension(
				renderHeight * settings.sceneScale,
			);
			const nextPrepassWidth = targetDimension(
				nextSceneWidth * currentPrepassScale,
			);
			const nextPrepassHeight = targetDimension(
				nextSceneHeight * currentPrepassScale,
			);
			const nextBloomWidth = targetDimension(
				settings.enableBloomPass ? nextSceneWidth * settings.bloomScale : 1,
			);
			const nextBloomHeight = targetDimension(
				settings.enableBloomPass ? nextSceneHeight * settings.bloomScale : 1,
			);

			sceneWidth = nextSceneWidth;
			sceneHeight = nextSceneHeight;
			prepassWidth = nextPrepassWidth;
			prepassHeight = nextPrepassHeight;
			bloomWidth = nextBloomWidth;
			bloomHeight = nextBloomHeight;

			const nextTargets: Partial<OptimizedTargets> = {};

			try {
				nextTargets.prepass = createMultiRenderTarget(
					gl,
					prepassWidth,
					prepassHeight,
					floatFormat,
					2,
				);
				nextTargets.composite = createPingPongTarget(
					gl,
					sceneWidth,
					sceneHeight,
					floatFormat,
					"linear",
				);
				nextTargets.bloomMip = createRenderTarget(
					gl,
					bloomWidth,
					bloomHeight,
					floatFormat,
					"linear",
				);
				nextTargets.bloomHorizontal = createRenderTarget(
					gl,
					bloomWidth,
					bloomHeight,
					floatFormat,
					"linear",
				);
				nextTargets.bloomVertical = createRenderTarget(
					gl,
					bloomWidth,
					bloomHeight,
					floatFormat,
					"linear",
				);
				nextTargets.scene = createRenderTarget(
					gl,
					sceneWidth,
					sceneHeight,
					floatFormat,
					"linear",
				);

				optimizedTargets = nextTargets as OptimizedTargets;
			} catch (error) {
				disposeOptimizedTargetGroup(nextTargets);
				throw error;
			}
		};

		const createFallbackTargets = () => {
			sceneWidth = allocatedTargetDimension(renderWidth * settings.sceneScale);
			sceneHeight = allocatedTargetDimension(
				renderHeight * settings.sceneScale,
			);
			prepassWidth = sceneWidth;
			prepassHeight = sceneHeight;
			bloomWidth = sceneWidth;
			bloomHeight = sceneHeight;
			const nextTargets: Partial<FallbackTargets> = {};

			try {
				nextTargets.a = createPingPongTarget(
					gl,
					sceneWidth,
					sceneHeight,
					fallbackFormat,
					"linear",
				);
				nextTargets.b = createPingPongTarget(
					gl,
					sceneWidth,
					sceneHeight,
					fallbackFormat,
					"linear",
				);
				nextTargets.c = createRenderTarget(
					gl,
					sceneWidth,
					sceneHeight,
					fallbackFormat,
					"linear",
				);
				nextTargets.d = createRenderTarget(
					gl,
					sceneWidth,
					sceneHeight,
					fallbackFormat,
					"linear",
				);
				nextTargets.scene = createRenderTarget(
					gl,
					sceneWidth,
					sceneHeight,
					fallbackFormat,
					"linear",
				);

				fallbackTargets = nextTargets as FallbackTargets;
			} catch (error) {
				disposeFallbackTargetGroup(nextTargets);
				throw error;
			}
		};

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			const dprCap =
				mode === "fallback"
					? Math.min(settings.maxDevicePixelRatio, DIRECT_FALLBACK_DPR)
					: settings.maxDevicePixelRatio;
			const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
			const nextWidth = Math.min(
				maxTextureSize,
				Math.max(1, Math.floor(rect.width * dpr * settings.resolutionScale)),
			);
			const nextHeight = Math.min(
				maxTextureSize,
				Math.max(1, Math.floor(rect.height * dpr * settings.resolutionScale)),
			);
			const nextSceneWidth = allocatedTargetDimension(
				nextWidth * settings.sceneScale,
			);
			const nextSceneHeight = allocatedTargetDimension(
				nextHeight * settings.sceneScale,
			);
			const nextPrepassWidth =
				mode === "optimized"
					? targetDimension(nextSceneWidth * currentPrepassScale)
					: nextSceneWidth;
			const nextPrepassHeight =
				mode === "optimized"
					? targetDimension(nextSceneHeight * currentPrepassScale)
					: nextSceneHeight;
			const nextBloomWidth =
				mode === "optimized"
					? targetDimension(
							settings.enableBloomPass
								? nextSceneWidth * settings.bloomScale
								: 1,
						)
					: nextSceneWidth;
			const nextBloomHeight =
				mode === "optimized"
					? targetDimension(
							settings.enableBloomPass
								? nextSceneHeight * settings.bloomScale
								: 1,
						)
					: nextSceneHeight;

			if (
				nextWidth === renderWidth &&
				nextHeight === renderHeight &&
				nextSceneWidth === sceneWidth &&
				nextSceneHeight === sceneHeight &&
				nextPrepassWidth === prepassWidth &&
				nextPrepassHeight === prepassHeight &&
				nextBloomWidth === bloomWidth &&
				nextBloomHeight === bloomHeight
			) {
				return;
			}

			renderWidth = nextWidth;
			renderHeight = nextHeight;
			currentDpr = dpr;
			canvas.width = renderWidth;
			canvas.height = renderHeight;
			disposeTargets();

			try {
				if (mode === "optimized")
					createTargetsWithRetry(createOptimizedTargets);
				else createTargetsWithRetry(createFallbackTargets);
			} catch (targetError) {
				if (mode === "optimized") {
					mode = "fallback";
					fallbackReason = formatError(targetError);
					targetAllocationScale = 1;
					disposeOptimizedTargets();
					ensureFallbackPasses();
					createTargetsWithRetry(createFallbackTargets);
				} else {
					throw targetError;
				}
			}

			frame = 0;
			startTime = performance.now();
			lastTime = startTime;
			shaderTime = 0;
			lastRenderNow = 0;
		};

		const publishStats = (frameTimeMs: number, now: number) => {
			if (!debugStats && !import.meta.env.DEV) return;
			if (!showControls && now - lastStatsPublish < 250) return;
			lastStatsPublish = now;

			const activeControls = lastAnimatedControls;
			const activeAtlas = glyphAtlasConfig;
			const stats: BlackHoleStats = {
				mode,
				backend: "webgl2",
				requestedRendererMode: rendererModeState,
				runtimeProfile,
				frame,
				frameTimeMs,
				cpuAverageFrameTimeMs,
				averageFrameTimeMs,
				fps: averageFrameTimeMs > 0 ? 1000 / averageFrameTimeMs : 0,
				reactRenderCount: reactRenderCountRef.current,
				dpr: currentDpr,
				targetAllocationScale,
				prepassScale: currentPrepassScale,
				bloomScale: settings.bloomScale,
				sceneScale: settings.sceneScale,
				asciiEnabled: lastAnimatedAsciiEnabled,
				asciiCellSize: activeAtlas.cellSize,
				renderWidth,
				renderHeight,
				sceneWidth,
				sceneHeight,
				prepassWidth,
				prepassHeight,
				bloomWidth,
				bloomHeight,
				cameraPosition: [...camera.position],
				cameraForward: [...camera.forward],
				universeSign: camera.universeSign,
				movementSpeed,
				timeScale: activeControls.timeScale,
				exposure: activeControls.exposure,
				bloomStrength: activeControls.bloomStrength,
				temporalJitter: activeControls.temporalJitter,
				invertControls: activeControls.invertControls,
				paletteMode: activeControls.paletteMode,
				glyphCount: activeAtlas.glyphCount,
				fontFamily: activeAtlas.fontFamily,
				textSize: activeAtlas.textSize,
				asciiBrightness: activeControls.brightness,
				asciiContrast: activeControls.contrast,
				shaderTime,
				qualityPreset: settings.qualityPreset,
				qualityValue: settings.qualityValue,
				maxDevicePixelRatio: settings.maxDevicePixelRatio,
				resolutionScale: settings.resolutionScale,
				cellWidth: settings.cellWidth,
				cellHeight: settings.cellHeight,
				cellCount: renderWidth * renderHeight,
				computeWorkgroups: 0,
				computeInvocations: 0,
				frameIntervalMs: settings.frameIntervalMs,
				enableBloomPass: settings.enableBloomPass,
				passCount: mode === "optimized" ? 5 : 6,
				estimatedTextureMemoryBytes:
					mode === "optimized"
						? estimateTextureMemoryBytes(prepassWidth, prepassHeight, 8, 2) +
							estimateTextureMemoryBytes(sceneWidth, sceneHeight, 8, 3) +
							estimateTextureMemoryBytes(bloomWidth, bloomHeight, 8, 3)
						: estimateTextureMemoryBytes(sceneWidth, sceneHeight, 4, 7),
				initTimeMs,
				gpuFrameTimeMs: null,
				gpuTimingSupported: false,
				webgpuAvailable: isWebGpuAvailable(),
				fallbackReason:
					[fallbackReason, allocationScaleReason].filter(Boolean).join("; ") ||
					null,
				lastAllocationFailure,
				animationMode: activeAnimationMode(),
				animationRoute: activeAnimationRoute,
				animationPhase,
				animationPlaying: animationPlayingRef.current,
				animationFrameIndex,
				animationSequenceTime,
			};

			window.__blackHoleStats = stats;
		};

		const maybeAdaptQuality = () => {
			if (
				mode !== "optimized" ||
				frame < 120 ||
				frame % 90 !== 0 ||
				hasFixedPrepassScaleRef.current ||
				settings.qualityPreset === "custom"
			)
				return;

			const previousScale = currentPrepassScale;
			if (averageFrameTimeMs > FRAME_TARGET_MS * 1.15) {
				currentPrepassScale = Math.max(
					MIN_PREPASS_SCALE,
					currentPrepassScale - 0.06,
				);
			}

			if (Math.abs(previousScale - currentPrepassScale) > 0.001) {
				disposeOptimizedTargets();
				try {
					createTargetsWithRetry(createOptimizedTargets);
				} catch (targetError) {
					mode = "fallback";
					fallbackReason = formatError(targetError);
					targetAllocationScale = 1;
					disposeOptimizedTargets();
					ensureFallbackPasses();
					createTargetsWithRetry(createFallbackTargets);
				}
				frame = 0;
				startTime = performance.now();
				lastTime = startTime;
				shaderTime = 0;
				lastRenderNow = 0;
			}
		};

		const renderOptimized = (
			time: number,
			delta: number,
			shouldUpdatePrepass: boolean,
			shouldUpdateBloom: boolean,
			activeRenderUniforms: RenderUniforms,
			activeAsciiEnabled: boolean,
		) => {
			if (!optimizedPasses || !optimizedTargets) return;

			if (shouldUpdatePrepass) {
				renderPass(
					gl,
					optimizedPasses.prepass,
					vertexBuffer,
					optimizedTargets.prepass,
					prepassWidth,
					prepassHeight,
					time,
					delta,
					frame,
					mouse,
					[fallbackTexture, fallbackTexture, fallbackTexture, fallbackTexture],
					camera,
					settings.qualityValue,
					0.5,
					0,
					channelResolutionScratch,
					activeRenderUniforms,
				);
			}

			renderPass(
				gl,
				optimizedPasses.composite,
				vertexBuffer,
				optimizedTargets.composite.write,
				sceneWidth,
				sceneHeight,
				time,
				delta,
				frame,
				mouse,
				[
					optimizedTargets.prepass.textures[0],
					optimizedTargets.prepass.textures[1],
					optimizedTargets.composite.read,
					fallbackTexture,
				],
				camera,
				settings.qualityValue,
				0.5,
				0,
				channelResolutionScratch,
				activeRenderUniforms,
			);

			if (shouldUpdateBloom) {
				renderPass(
					gl,
					optimizedPasses.bloom,
					vertexBuffer,
					optimizedTargets.bloomMip,
					bloomWidth,
					bloomHeight,
					time,
					delta,
					frame,
					mouse,
					[
						optimizedTargets.composite.write,
						fallbackTexture,
						fallbackTexture,
						fallbackTexture,
					],
					camera,
					settings.qualityValue,
					0.5,
					0,
					channelResolutionScratch,
					activeRenderUniforms,
				);
				renderPass(
					gl,
					optimizedPasses.bloom,
					vertexBuffer,
					optimizedTargets.bloomHorizontal,
					bloomWidth,
					bloomHeight,
					time,
					delta,
					frame,
					mouse,
					[
						optimizedTargets.bloomMip,
						fallbackTexture,
						fallbackTexture,
						fallbackTexture,
					],
					camera,
					settings.qualityValue,
					0.5,
					1,
					channelResolutionScratch,
					activeRenderUniforms,
				);
				renderPass(
					gl,
					optimizedPasses.bloom,
					vertexBuffer,
					optimizedTargets.bloomVertical,
					bloomWidth,
					bloomHeight,
					time,
					delta,
					frame,
					mouse,
					[
						optimizedTargets.bloomHorizontal,
						fallbackTexture,
						fallbackTexture,
						fallbackTexture,
					],
					camera,
					settings.qualityValue,
					0.5,
					2,
					channelResolutionScratch,
					activeRenderUniforms,
				);
			}

			if (activeAsciiEnabled) {
				renderPass(
					gl,
					optimizedPasses.image,
					vertexBuffer,
					optimizedTargets.scene,
					sceneWidth,
					sceneHeight,
					time,
					delta,
					frame,
					mouse,
					[
						optimizedTargets.composite.write,
						fallbackTexture,
						fallbackTexture,
						settings.enableBloomPass
							? optimizedTargets.bloomVertical
							: fallbackTexture,
					],
					camera,
					settings.qualityValue,
					0.5,
					0,
					channelResolutionScratch,
					activeRenderUniforms,
				);

				renderPass(
					gl,
					optimizedPasses.ascii,
					vertexBuffer,
					null,
					renderWidth,
					renderHeight,
					time,
					delta,
					frame,
					mouse,
					[
						optimizedTargets.scene,
						glyphTextures.atlas,
						glyphTextures.metrics,
						fallbackTexture,
					],
					camera,
					settings.qualityValue,
					0.5,
					0,
					channelResolutionScratch,
					activeRenderUniforms,
				);
			} else {
				renderPass(
					gl,
					optimizedPasses.image,
					vertexBuffer,
					null,
					renderWidth,
					renderHeight,
					time,
					delta,
					frame,
					mouse,
					[
						optimizedTargets.composite.write,
						fallbackTexture,
						fallbackTexture,
						settings.enableBloomPass
							? optimizedTargets.bloomVertical
							: fallbackTexture,
					],
					camera,
					settings.qualityValue,
					0.5,
					0,
					channelResolutionScratch,
					activeRenderUniforms,
				);
			}

			optimizedTargets.composite.swap();
		};

		const renderFallback = (
			time: number,
			delta: number,
			activeRenderUniforms: RenderUniforms,
			activeAsciiEnabled: boolean,
		) => {
			if (!fallbackPasses || !fallbackTargets) return;

			renderPass(
				gl,
				fallbackPasses.a,
				vertexBuffer,
				fallbackTargets.a.write,
				sceneWidth,
				sceneHeight,
				time,
				delta,
				frame,
				mouse,
				[
					keyboardTexture,
					fallbackTexture,
					fallbackTargets.b.read,
					fallbackTargets.a.read,
				],
				camera,
				settings.qualityValue,
				0.5,
				0,
				channelResolutionScratch,
				activeRenderUniforms,
			);
			renderPass(
				gl,
				fallbackPasses.b,
				vertexBuffer,
				fallbackTargets.b.write,
				sceneWidth,
				sceneHeight,
				time,
				delta,
				frame,
				mouse,
				[
					fallbackTargets.a.write,
					fallbackTargets.b.read,
					fallbackTexture,
					keyboardTexture,
				],
				camera,
				settings.qualityValue,
				0.5,
				0,
				channelResolutionScratch,
				activeRenderUniforms,
			);
			renderPass(
				gl,
				fallbackPasses.c,
				vertexBuffer,
				fallbackTargets.c,
				sceneWidth,
				sceneHeight,
				time,
				delta,
				frame,
				mouse,
				[
					fallbackTargets.b.write,
					fallbackTexture,
					fallbackTexture,
					fallbackTexture,
				],
				camera,
				settings.qualityValue,
				0.5,
				0,
				channelResolutionScratch,
				activeRenderUniforms,
			);
			renderPass(
				gl,
				fallbackPasses.d,
				vertexBuffer,
				fallbackTargets.d,
				sceneWidth,
				sceneHeight,
				time,
				delta,
				frame,
				mouse,
				[fallbackTargets.c, fallbackTexture, fallbackTexture, fallbackTexture],
				camera,
				settings.qualityValue,
				0.5,
				0,
				channelResolutionScratch,
				activeRenderUniforms,
			);
			if (activeAsciiEnabled) {
				renderPass(
					gl,
					fallbackPasses.image,
					vertexBuffer,
					fallbackTargets.scene,
					sceneWidth,
					sceneHeight,
					time,
					delta,
					frame,
					mouse,
					[
						fallbackTargets.a.write,
						fallbackTargets.b.write,
						fallbackTargets.c,
						fallbackTargets.d,
					],
					camera,
					settings.qualityValue,
					0.5,
					0,
					channelResolutionScratch,
					activeRenderUniforms,
				);
				renderPass(
					gl,
					fallbackPasses.ascii,
					vertexBuffer,
					null,
					renderWidth,
					renderHeight,
					time,
					delta,
					frame,
					mouse,
					[
						fallbackTargets.scene,
						glyphTextures.atlas,
						glyphTextures.metrics,
						fallbackTexture,
					],
					camera,
					settings.qualityValue,
					0.5,
					0,
					channelResolutionScratch,
					activeRenderUniforms,
				);
			} else {
				renderPass(
					gl,
					fallbackPasses.image,
					vertexBuffer,
					null,
					renderWidth,
					renderHeight,
					time,
					delta,
					frame,
					mouse,
					[
						fallbackTargets.a.write,
						fallbackTargets.b.write,
						fallbackTargets.c,
						fallbackTargets.d,
					],
					camera,
					settings.qualityValue,
					0.5,
					0,
					channelResolutionScratch,
					activeRenderUniforms,
				);
			}

			fallbackTargets.a.swap();
			fallbackTargets.b.swap();
		};

		const renderFrame = (now: number) => {
			if (disposed) return;

			const cpuFrameStart = performance.now();
			animationFrame = 0;

			try {
				resize();

				if (keyboardDirty) {
					updateKeyboardTexture(gl, keyboardTexture, keyboardData);
					keyboardDirty = false;
				}

				syncAnimationRoute();
				const animationActiveBeforeFrame = animationIsOwningCamera();
				const activeControlInput =
					forceActiveRender ||
					animationActiveBeforeFrame ||
					hasActiveControls(keyboardData, pointerActive);
				if (
					mode === "optimized" &&
					frame > 2 &&
					!activeControlInput &&
					lastRenderNow > 0 &&
					idleRenderInterval > 0 &&
					now - lastRenderNow < idleRenderInterval
				) {
					animationFrame = requestAnimationFrame(renderFrame);
					return;
				}
				lastRenderNow = now;

				const delta = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
				const animationFrameState = evaluateAnimationFrame(delta);
				const liveControls = animationFrameState.controls;
				const activeAsciiEnabled = animationFrameState.asciiEnabled;
				const nextGlyphControlsKey = glyphControlsKey(liveControls);
				if (nextGlyphControlsKey !== liveGlyphControlsKey) {
					liveGlyphControlsKey = nextGlyphControlsKey;
					syncGlyphAtlasConfig(createGlyphAtlasConfig(liveControls));
				}
				writeRenderUniforms(
					activeRenderUniforms,
					liveControls,
					glyphAtlasConfig,
					activeAsciiEnabled,
					asciiMix,
				);
				const shaderDelta = delta * liveControls.timeScale;
				lastTime = now;
				shaderTime += shaderDelta;

				if (!animationFrameState.active) {
					updateCamera(camera, keyboardData, delta, movementSpeed);
				}
				snapshotRuntime(false, now);

				gl.disable(gl.DEPTH_TEST);
				gl.disable(gl.BLEND);
				gl.clearColor(0, 0, 0, 1);

				if (mode === "optimized") {
					const prepassStride = activeControlInput
						? ACTIVE_PREPASS_STRIDE
						: IDLE_PREPASS_STRIDE;
					const shouldUpdatePrepass = frame < 2 || frame % prepassStride === 0;
					const shouldUpdateBloom =
						settings.enableBloomPass &&
						(frame < 2 ||
							shouldUpdatePrepass ||
							frame % BLOOM_FRAME_STRIDE === 0);

					renderOptimized(
						shaderTime,
						shaderDelta,
						shouldUpdatePrepass,
						shouldUpdateBloom,
						activeRenderUniforms,
						activeAsciiEnabled,
					);
				} else
					renderFallback(
						shaderTime,
						shaderDelta,
						activeRenderUniforms,
						activeAsciiEnabled,
					);

				const frameTimeMs = performance.now() - cpuFrameStart;
				cpuAverageFrameTimeMs =
					cpuAverageFrameTimeMs * 0.94 + frameTimeMs * 0.06;
				averageFrameTimeMs = averageFrameTimeMs * 0.94 + delta * 1000 * 0.06;
				publishStats(frameTimeMs, now);
				updateCameraReadout(now);
				maybeAdaptQuality();

				frame += 1;
			} catch (renderError) {
				setError(formatError(renderError));
				disposed = true;
				disposeTargets();
				return;
			}

			if (!document.hidden && !reducedMotion.matches) {
				animationFrame = requestAnimationFrame(renderFrame);
			}
		};

		const requestRender = () => {
			if (!disposed && !contextLost && !animationFrame && !document.hidden) {
				animationFrame = requestAnimationFrame(renderFrame);
			}
		};
		requestRenderRef.current = requestRender;

		const setKey = (event: KeyboardEvent, pressed: boolean) => {
			if (!interactive) return;
			if (isControlKeyboardTarget(event.target)) return;
			if (event.keyCode < 0 || event.keyCode > 255) return;
			if (pressed) stopEditorAnimationForManualInput();
			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				event.preventDefault();
				if (pressed) {
					movementSpeed *=
						event.key === "ArrowUp" ? MOVE_SPEED_FACTOR : 1 / MOVE_SPEED_FACTOR;
					requestRender();
				}
				return;
			}
			if (CONTROL_KEY_CODES.has(event.keyCode)) event.preventDefault();
			keyboardData[event.keyCode * 4] = pressed ? 255 : 0;
			keyboardDirty = true;
			requestRender();
		};

		const pointerPosition = (event: PointerEvent) => {
			const rect = canvas.getBoundingClientRect();
			const mouseWidth = Math.max(sceneWidth, 1);
			const mouseHeight = Math.max(sceneHeight, 1);
			const x =
				((event.clientX - rect.left) / Math.max(rect.width, 1)) * mouseWidth;
			const y =
				((rect.bottom - event.clientY) / Math.max(rect.height, 1)) *
				mouseHeight;
			mouse[0] = x;
			mouse[1] = y;
		};

		const handlePointerDown = (event: PointerEvent) => {
			if (!interactive) return;
			stopEditorAnimationForManualInput();
			canvas.setPointerCapture(event.pointerId);
			pointerActive = true;
			lastPointerX = event.clientX;
			lastPointerY = event.clientY;
			pointerPosition(event);
			mouse[2] = Math.max(1, mouse[0]);
			mouse[3] = mouse[1];
			requestRender();
		};

		const handlePointerMove = (event: PointerEvent) => {
			if (!interactive) return;
			pointerPosition(event);
			if (pointerActive) {
				const dx = event.clientX - lastPointerX;
				const dy = event.clientY - lastPointerY;
				lastPointerX = event.clientX;
				lastPointerY = event.clientY;
				camera.pendingYaw += -dx * MOUSE_SENSITIVITY;
				camera.pendingPitch +=
					(controlsRef.current.invertControls ? dy : -dy) * MOUSE_SENSITIVITY;
			}
			requestRender();
		};

		const handlePointerUp = (event: PointerEvent) => {
			if (!interactive) return;
			if (canvas.hasPointerCapture(event.pointerId))
				canvas.releasePointerCapture(event.pointerId);
			pointerActive = false;
			pointerPosition(event);
			mouse[2] = -1;
			mouse[3] = -1;
			requestRender();
		};

		const handleVisibilityChange = () => {
			if (document.hidden) {
				if (animationFrame) cancelAnimationFrame(animationFrame);
				animationFrame = 0;
				return;
			}

			lastTime = performance.now();
			requestRender();
		};

		const handleContextLost = (event: Event) => {
			event.preventDefault();
			contextLost = true;
			disposed = true;
			if (animationFrame) cancelAnimationFrame(animationFrame);
			animationFrame = 0;
			setError("WebGL context lost. Restoring renderer...");
		};

		const handleContextRestored = () => {
			contextLost = false;
			setError(null);
			setContextRestoreToken((token) => token + 1);
		};

		const resizeObserver = new ResizeObserver(requestRender);
		resizeObserver.observe(canvas);

		const handleKeyDown = (event: KeyboardEvent) => setKey(event, true);
		const handleKeyUp = (event: KeyboardEvent) => setKey(event, false);

		if (interactive) {
			window.addEventListener("keydown", handleKeyDown);
			window.addEventListener("keyup", handleKeyUp);
			canvas.addEventListener("pointerdown", handlePointerDown);
			canvas.addEventListener("pointermove", handlePointerMove);
			canvas.addEventListener("pointerup", handlePointerUp);
			canvas.addEventListener("pointercancel", handlePointerUp);
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);
		canvas.addEventListener("webglcontextlost", handleContextLost);
		canvas.addEventListener("webglcontextrestored", handleContextRestored);

		initTimeMs = performance.now() - setupStart;
		updateCameraReadout(performance.now(), true);
		requestRender();

		return () => {
			snapshotRuntime(true);
			disposed = true;
			if (animationFrame) cancelAnimationFrame(animationFrame);
			resizeObserver.disconnect();
			if (interactive) {
				window.removeEventListener("keydown", handleKeyDown);
				window.removeEventListener("keyup", handleKeyUp);
				canvas.removeEventListener("pointerdown", handlePointerDown);
				canvas.removeEventListener("pointermove", handlePointerMove);
				canvas.removeEventListener("pointerup", handlePointerUp);
				canvas.removeEventListener("pointercancel", handlePointerUp);
			}
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			canvas.removeEventListener("webglcontextlost", handleContextLost);
			canvas.removeEventListener("webglcontextrestored", handleContextRestored);
			disposeTargets();
			gl.deleteBuffer(vertexBuffer);
			gl.deleteTexture(fallbackTexture.texture);
			gl.deleteTexture(keyboardTexture.texture);
			Object.values(optimizedPasses ?? {}).forEach((pass) => {
				gl.deleteProgram(pass.program);
			});
			Object.values(fallbackPasses ?? {}).forEach((pass) => {
				gl.deleteProgram(pass.program);
			});
			glyphTextures.dispose();
			requestRenderRef.current = () => {};
			cameraEditorRef.current = {
				applyPosition: () => false,
				applyForward: () => false,
				applyUniverse: () => false,
				sync: () => {},
			};
			delete window.__blackHoleStats;
		};
	}, [
		renderSettings,
		asciiMix,
		showControls,
		interactive,
		debugStats,
		idleRenderIntervalMs,
		forceActiveRender,
		rendererModeState,
		backendState,
		initialCameraKey,
		initialCameraPosition,
		initialCameraForward,
		initialUniverseSign,
		contextRestoreToken,
		animationMode,
	]);

	const glyphPresetOptions: Array<{ label: string; value: GlyphPreset }> = [
		{ label: "Gargantua", value: "gargantua" },
		{ label: "Classic", value: "classic" },
		{ label: "Dense", value: "dense" },
		{ label: "Custom", value: "custom" },
	];
	const qualityPresetOptions: Array<{ label: string; value: QualityPreset }> = [
		{ label: "Mobile Safe", value: "mobile-safe" },
		{ label: "ASCII Balanced", value: "ascii-balanced" },
		{ label: "ASCII Sharp", value: "ascii-sharp" },
		{ label: "Performance", value: "performance" },
		{ label: "Balanced", value: "balanced" },
		{ label: "Visual", value: "visual" },
		{ label: "Desktop Full", value: "desktop-full" },
		{ label: "Stress Test", value: "stress-test" },
		{ label: "Custom", value: "custom" },
	];
	const rendererModeOptions: Array<{ label: string; value: RendererMode }> = [
		{ label: "Auto", value: "auto" },
		{ label: "Full", value: "full" },
		{ label: "Fallback Full", value: "fallback-full" },
	];
	const backendOptions: Array<{ label: string; value: ShaderBackend }> = [
		{ label: "Auto", value: "auto" },
		{ label: "WebGL2", value: "webgl2" },
		{ label: "WebGPU Experimental", value: "webgpu" },
	];
	const fontOptions = FONT_OPTIONS.map((font) => ({
		label: font,
		value: font,
	}));

	return (
		<div className={`relative h-full w-full bg-black ${className}`}>
			<canvas
				key={`${rendererModeState}:${backendState}:${contextRestoreToken}`}
				ref={canvasRef}
				className={`block h-full w-full bg-black ${
					interactive ? "cursor-crosshair touch-none" : "pointer-events-none"
				}`}
				aria-label="Interactive black hole shader"
			/>
			{showControls ? (
				<div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 grid max-h-[calc(100dvh-1.5rem)] gap-2 overflow-y-auto overscroll-contain pr-1 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[22rem]">
					<div className="pointer-events-auto overflow-hidden rounded-md">
						<ControlPanel
							title="Black Hole"
							icon={<SlidersHorizontal aria-hidden className="h-4 w-4" />}
							open={blackHolePanelOpen}
							onToggle={() => setBlackHolePanelOpen((open) => !open)}
						>
							<NumberControl
								label="Speed"
								value={controls.timeScale}
								step={0.05}
								onChange={(value) => updateControl("timeScale", value)}
							/>
							<NumberControl
								label="Exposure"
								value={controls.exposure}
								step={0.05}
								onChange={(value) => updateControl("exposure", value)}
							/>
							<NumberControl
								label="Bloom"
								value={controls.bloomStrength}
								step={0.05}
								onChange={(value) => updateControl("bloomStrength", value)}
							/>
							<ToggleControl
								label="Invert Look"
								checked={controls.invertControls}
								onChange={(checked) => updateControl("invertControls", checked)}
							/>
							<SelectControl
								label="Color"
								value={controls.paletteMode}
								options={[
									{ label: "Source", value: "source" },
									{ label: "Custom", value: "custom" },
								]}
								onChange={(value) => updateControl("paletteMode", value)}
							/>
							{controls.paletteMode === "custom" ? (
								<div className="grid grid-cols-3 gap-2">
									<ColorControl
										label="Shadow"
										value={controls.shadowColor}
										onChange={(value) => updateControl("shadowColor", value)}
									/>
									<ColorControl
										label="Mid"
										value={controls.midColor}
										onChange={(value) => updateControl("midColor", value)}
									/>
									<ColorControl
										label="High"
										value={controls.highlightColor}
										onChange={(value) => updateControl("highlightColor", value)}
									/>
								</div>
							) : null}
							<div className="grid gap-3 border-t border-white/10 pt-3">
								<SelectControl
									label="Renderer"
									value={rendererModeState}
									options={rendererModeOptions}
									onChange={updateRendererMode}
								/>
								<SelectControl
									label="Backend"
									value={backendState}
									options={backendOptions}
									onChange={updateBackend}
								/>
								<ToggleControl
									label="ASCII Effect"
									checked={renderSettings.asciiEnabled}
									onChange={updateAsciiEnabled}
								/>
								<ToggleControl
									label="Bloom Pass"
									checked={renderSettings.enableBloomPass}
									onChange={(checked) =>
										updateRenderSetting("enableBloomPass", checked)
									}
								/>
								<SelectControl
									label="Preset"
									value={renderSettings.qualityPreset}
									options={qualityPresetOptions}
									onChange={applyQualityPreset}
								/>
								<div className="grid gap-1">
									<NumberControl
										label="Temporal jitter"
										value={controls.temporalJitter}
										min={0}
										step={0.01}
										onChange={(value) => updateControl("temporalJitter", value)}
									/>
									<p className="font-mono text-[10px] leading-snug text-white/35">
										0 stable, 0.05 tiny AA, 0.25+ shimmer
									</p>
								</div>
								<div className="grid grid-cols-2 gap-3">
									<NumberControl
										label="Trace"
										value={renderSettings.qualityValue}
										min={MIN_QUALITY_VALUE}
										step={0.01}
										onChange={(value) =>
											updateRenderSetting("qualityValue", value)
										}
									/>
									<NumberControl
										label="DPR"
										value={renderSettings.maxDevicePixelRatio}
										min={MIN_DPR}
										step={0.05}
										onChange={(value) =>
											updateRenderSetting("maxDevicePixelRatio", value)
										}
									/>
									<NumberControl
										label="Scene"
										value={renderSettings.sceneScale}
										min={MIN_RENDER_SCALE}
										step={0.01}
										onChange={(value) =>
											updateRenderSetting("sceneScale", value)
										}
									/>
									<NumberControl
										label="Prepass"
										value={renderSettings.prepassScale}
										min={MIN_RENDER_SCALE}
										step={0.01}
										onChange={(value) =>
											updateRenderSetting("prepassScale", value)
										}
									/>
									<NumberControl
										label="Bloom Res"
										value={renderSettings.bloomScale}
										min={MIN_RENDER_SCALE}
										step={0.01}
										onChange={(value) =>
											updateRenderSetting("bloomScale", value)
										}
									/>
									<NumberControl
										label="Canvas"
										value={renderSettings.resolutionScale}
										min={MIN_RENDER_SCALE}
										step={0.05}
										onChange={(value) =>
											updateRenderSetting("resolutionScale", value)
										}
									/>
									<NumberControl
										label="Cell W"
										value={renderSettings.cellWidth}
										min={2}
										step={1}
										onChange={(value) =>
											updateRenderSetting("cellWidth", value)
										}
									/>
									<NumberControl
										label="Cell H"
										value={renderSettings.cellHeight}
										min={2}
										step={1}
										onChange={(value) =>
											updateRenderSetting("cellHeight", value)
										}
									/>
									<NumberControl
										label="Frame Cap"
										value={renderSettings.frameIntervalMs}
										min={0}
										step={1}
										onChange={(value) =>
											updateRenderSetting("frameIntervalMs", value)
										}
									/>
								</div>
							</div>
							{animationMode !== "off" ? (
								<div className="grid gap-3 border-t border-white/10 pt-3">
									<div className="flex items-center justify-between gap-3 font-mono text-[11px] text-white/70">
										<span>Animation</span>
										<span className="truncate text-white/35">
											{animationEditorStatus}
										</span>
									</div>
									<SelectControl
										label="Route"
										value={animationEditorRoute}
										options={[...BLACK_HOLE_ANIMATION_ROUTE_OPTIONS]}
										onChange={setAnimationEditorRoute}
									/>
									<div className="grid grid-cols-2 gap-2">
										<button
											type="button"
											onClick={() =>
												animationPlaying
													? animationEditorRef.current.pause()
													: animationEditorRef.current.play()
											}
											className="inline-flex h-8 items-center justify-center gap-2 border border-white/15 bg-black/80 px-2 font-mono text-[11px] text-white/75 hover:border-cyan-300 hover:text-white"
										>
											{animationPlaying ? (
												<Pause aria-hidden className="h-3.5 w-3.5" />
											) : (
												<Play aria-hidden className="h-3.5 w-3.5" />
											)}
											{animationPlaying ? "Pause" : "Play"}
										</button>
										<button
											type="button"
											onClick={() => animationEditorRef.current.restartIntro()}
											className="inline-flex h-8 items-center justify-center gap-2 border border-white/15 bg-black/80 px-2 font-mono text-[11px] text-white/75 hover:border-cyan-300 hover:text-white"
										>
											<RotateCcw aria-hidden className="h-3.5 w-3.5" />
											Intro
										</button>
										<button
											type="button"
											onClick={() => animationEditorRef.current.previewIdle()}
											className="inline-flex h-8 items-center justify-center gap-2 border border-white/15 bg-black/80 px-2 font-mono text-[11px] text-white/75 hover:border-cyan-300 hover:text-white"
										>
											<Play aria-hidden className="h-3.5 w-3.5" />
											Idle
										</button>
										<button
											type="button"
											onClick={() =>
												copyAnimationText(
													"route",
													animationEditorRef.current.routeConfig(),
												)
											}
											className="inline-flex h-8 items-center justify-center gap-2 border border-white/15 bg-black/80 px-2 font-mono text-[11px] text-white/75 hover:border-cyan-300 hover:text-white"
										>
											<Copy aria-hidden className="h-3.5 w-3.5" />
											Route
										</button>
									</div>
									<button
										type="button"
										onClick={() =>
											copyAnimationText(
												"keyframe",
												animationEditorRef.current.currentKeyframe(),
											)
										}
										className="inline-flex h-8 items-center justify-center gap-2 border border-white/15 bg-black/80 px-2 font-mono text-[11px] text-white/75 hover:border-cyan-300 hover:text-white"
									>
										<Copy aria-hidden className="h-3.5 w-3.5" />
										Copy Current Keyframe
									</button>
								</div>
							) : null}
							<div className="grid gap-2 border-t border-white/10 pt-3 font-mono text-[11px] text-white/70">
								<div className="flex items-center justify-between gap-3">
									<span>Camera</span>
									<span className="text-white/35">enter to apply</span>
								</div>
								<label className="grid gap-1">
									<span>Position</span>
									<input
										ref={cameraPositionInputRef}
										type="text"
										onFocus={(event) => event.currentTarget.select()}
										onBlur={applyCameraPositionInput}
										onKeyDown={(event) =>
											handleCameraInputKeyDown(event, applyCameraPositionInput)
										}
										className="h-8 border border-white/15 bg-black/80 px-2 text-white outline-none focus:border-cyan-300"
									/>
								</label>
								<label className="grid gap-1">
									<span>Forward</span>
									<input
										ref={cameraForwardInputRef}
										type="text"
										onFocus={(event) => event.currentTarget.select()}
										onBlur={applyCameraForwardInput}
										onKeyDown={(event) =>
											handleCameraInputKeyDown(event, applyCameraForwardInput)
										}
										className="h-8 border border-white/15 bg-black/80 px-2 text-white outline-none focus:border-cyan-300"
									/>
								</label>
								<label className="grid gap-1">
									<span>Universe</span>
									<input
										ref={cameraUniverseInputRef}
										type="text"
										onFocus={(event) => event.currentTarget.select()}
										onBlur={applyCameraUniverseInput}
										onKeyDown={(event) =>
											handleCameraInputKeyDown(event, applyCameraUniverseInput)
										}
										className="h-8 border border-white/15 bg-black/80 px-2 text-white outline-none focus:border-cyan-300"
									/>
								</label>
							</div>
						</ControlPanel>
					</div>

					<div className="pointer-events-auto overflow-hidden rounded-md">
						<ControlPanel
							title="ASCII"
							icon={<Type aria-hidden className="h-4 w-4" />}
							open={asciiPanelOpen}
							onToggle={() => setAsciiPanelOpen((open) => !open)}
						>
							<SelectControl
								label="Text"
								value={controls.glyphPreset}
								options={glyphPresetOptions}
								onChange={(value) => updateControl("glyphPreset", value)}
							/>
							<label className="grid gap-1 font-mono text-[11px] text-white/70">
								<span>Custom</span>
								<input
									type="text"
									value={controls.customGlyphs}
									disabled={controls.glyphPreset !== "custom"}
									onChange={(event) =>
										updateControl("customGlyphs", event.currentTarget.value)
									}
									className="h-8 border border-white/15 bg-black/80 px-2 text-white outline-none disabled:cursor-not-allowed disabled:opacity-40 focus:border-cyan-300"
								/>
							</label>
							<SelectControl
								label="Font"
								value={controls.fontFamily}
								options={fontOptions}
								onChange={(value) => updateControl("fontFamily", value)}
							/>
							<NumberControl
								label="Size"
								value={controls.textSize}
								min={MIN_TEXT_SIZE}
								step={1}
								onChange={(value) => updateControl("textSize", value)}
							/>
							<div className="grid grid-cols-2 gap-3">
								<NumberControl
									label="Bright"
									value={controls.brightness}
									step={0.01}
									onChange={(value) => updateControl("brightness", value)}
								/>
								<NumberControl
									label="Contrast"
									value={controls.contrast}
									step={0.05}
									onChange={(value) => updateControl("contrast", value)}
								/>
							</div>
						</ControlPanel>
					</div>

					<div className="pointer-events-auto overflow-hidden rounded-md">
						<ControlPanel
							title="Benchmark"
							icon={<SlidersHorizontal aria-hidden className="h-4 w-4" />}
							open={benchmarkPanelOpen}
							onToggle={() => setBenchmarkPanelOpen((open) => !open)}
						>
							<button
								type="button"
								onClick={() => void runBenchmark()}
								disabled={benchmarkRunning}
								className="inline-flex h-8 items-center justify-center gap-2 border border-white/15 bg-black/80 px-2 font-mono text-[11px] text-white/75 hover:border-cyan-300 hover:text-white disabled:cursor-wait disabled:opacity-50"
							>
								{benchmarkRunning ? "Running..." : "Run Benchmark"}
							</button>
							<div className="grid gap-2 font-mono text-[10px] text-white/65">
								{benchmarkResults.length === 0 ? (
									<p className="leading-snug text-white/35">
										Runs full, fallback, and WebGPU when available.
									</p>
								) : (
									benchmarkResults.map((result) => (
										<div
											key={`${result.label}:${result.activeMode}:${result.activeBackend}`}
											className="grid gap-1 border border-white/10 bg-black/50 p-2"
										>
											<div className="flex items-center justify-between gap-2 text-white/80">
												<span>{result.label}</span>
												<span>{formatMetric(result.averageFps)} fps</span>
											</div>
											<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-white/45">
												<span>Mode {result.activeMode}</span>
												<span>Backend {result.activeBackend}</span>
												<span>
													Wall {formatMetric(result.averageFrameTimeMs)} ms
												</span>
												<span>
													Wall P95 {formatMetric(result.p95FrameTimeMs)} ms
												</span>
												<span>
													CPU {formatMetric(result.cpuAverageFrameTimeMs)} ms
												</span>
												<span>
													CPU P95 {formatMetric(result.cpuP95FrameTimeMs)} ms
												</span>
												<span>Cells {result.cellCount.toLocaleString()}</span>
												<span>Passes {result.passCount}</span>
												<span>
													Groups {result.computeWorkgroups.toLocaleString()}
												</span>
												<span>
													Invokes {result.computeInvocations.toLocaleString()}
												</span>
												<span>
													Pixels {result.renderTargetPixels.toLocaleString()}
												</span>
												<span>
													{formatBytes(result.estimatedTextureMemoryBytes)}
												</span>
												<span>Init {formatMetric(result.initTimeMs)} ms</span>
												<span>
													GPU{" "}
													{result.gpuFrameTimeMs === null
														? result.gpuTimingSupported
															? "pending"
															: "n/a"
														: `${formatMetric(result.gpuFrameTimeMs)} ms`}
												</span>
											</div>
											{result.fallbackReason ? (
												<p className="text-red-200/70">
													{result.fallbackReason}
												</p>
											) : null}
										</div>
									))
								)}
							</div>
						</ControlPanel>
					</div>
				</div>
			) : null}
			{error ? (
				<div className="absolute inset-x-4 bottom-4 border border-red-500/60 bg-black/85 p-3 font-mono text-xs text-red-200">
					{error}
				</div>
			) : null}
		</div>
	);
}
