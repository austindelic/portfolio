import { useEffect, useRef, useState } from "react";
import bloomSource from "../shaders/black-hole/bloom.glsl?raw";
import bufferASource from "../shaders/black-hole/buffer-a.glsl?raw";
import bufferBSource from "../shaders/black-hole/buffer-b.glsl?raw";
import bufferCSource from "../shaders/black-hole/buffer-c.glsl?raw";
import bufferDSource from "../shaders/black-hole/buffer-d.glsl?raw";
import imageSource from "../shaders/black-hole/image.glsl?raw";

type Vec3 = [number, number, number];

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
		uBlendWeight: WebGLUniformLocation | null;
		uBloomMode: WebGLUniformLocation | null;
	};
};

type OptimizedPassSet = {
	prepass: ProgramPass;
	composite: ProgramPass;
	bloom: ProgramPass;
	image: ProgramPass;
};

type FallbackPassSet = {
	a: ProgramPass;
	b: ProgramPass;
	c: ProgramPass;
	d: ProgramPass;
	image: ProgramPass;
};

type OptimizedTargets = {
	prepass: MultiRenderTarget;
	composite: PingPongTarget;
	bloomMip: RenderTarget;
	bloomHorizontal: RenderTarget;
	bloomVertical: RenderTarget;
};

type FallbackTargets = {
	a: PingPongTarget;
	b: PingPongTarget;
	c: RenderTarget;
	d: RenderTarget;
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
	mode: "optimized" | "fallback";
	frame: number;
	frameTimeMs: number;
	averageFrameTimeMs: number;
	dpr: number;
	prepassScale: number;
	bloomScale: number;
	renderWidth: number;
	renderHeight: number;
	prepassWidth: number;
	prepassHeight: number;
	bloomWidth: number;
	bloomHeight: number;
	fallbackReason: string | null;
};

type Props = {
	className?: string;
	quality?: "balanced" | "performance" | "visual" | number;
	resolutionScale?: number;
	prepassScale?: number;
	bloomScale?: number;
	maxDevicePixelRatio?: number;
	debugStats?: boolean;
};

declare global {
	interface Window {
		__blackHoleStats?: BlackHoleStats;
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
uniform float uBlendWeight;
uniform int uBloomMode;
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
	return TraceRay(uv + jitterScale * jitter, resolution, inverseCamRot, relativePos, relativeDiskNormal, relativeDiskTangent, uUniverseSign);
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

	vec4 mapCol = RenderTopologyMap(uv, vec3(uCameraPosition.x, -uCameraPosition.y, -uCameraPosition.z), vec3(mapCamDir.x, -mapCamDir.y, -mapCamDir.z));
	finalColor.rgb = mix(finalColor.rgb, mapCol.rgb, mapCol.a);
	finalColor.a = mix(finalColor.a, 1.0, mapCol.a);

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

const FALLBACK_CHANNEL_RESOLUTIONS = new Float32Array(12);
const CONTROL_KEY_CODES = new Set([65, 68, 69, 70, 81, 82, 83, 87]);

const MOVE_SPEED = 2.5;
const MOUSE_SENSITIVITY = 0.003;
const ROLL_SPEED = 2.0;
const FRAME_TARGET_MS = 22;
const MIN_PREPASS_SCALE = 0.34;
const MAX_PREPASS_SCALE = 0.67;
const DIRECT_FALLBACK_DPR = 0.85;
const IDLE_PREPASS_STRIDE = 4;
const ACTIVE_PREPASS_STRIDE = 2;
const BLOOM_FRAME_STRIDE = 3;
const IDLE_RENDER_INTERVAL_MS = 24;

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

function createInitialCamera(): CameraState {
	const position: Vec3 = [-2.0, -3.6, 22.0];
	const forward = normalize([0.0, 0.15, -1.0]);
	const right = normalize(cross(forward, [-0.5, 1.0, 0.0]));
	const up = normalize(cross(right, forward));

	return {
		position,
		right,
		up,
		forward,
		universeSign: 1,
		pendingYaw: 0,
		pendingPitch: 0,
	};
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function resolveQualitySettings({
	quality,
	prepassScale,
	bloomScale,
	maxDevicePixelRatio,
}: Pick<
	Props,
	"quality" | "prepassScale" | "bloomScale" | "maxDevicePixelRatio"
>) {
	if (typeof quality === "number") {
		return {
			qualityValue: clamp(quality, 0.6, 1.15),
			initialPrepassScale: clamp(
				prepassScale ?? 0.5 * quality,
				MIN_PREPASS_SCALE,
				MAX_PREPASS_SCALE,
			),
			bloomScale: clamp(bloomScale ?? 0.5, 0.35, 0.75),
			maxDevicePixelRatio: maxDevicePixelRatio ?? 1.25,
		};
	}

	if (quality === "performance") {
		return {
			qualityValue: 0.65,
			initialPrepassScale: clamp(
				prepassScale ?? MIN_PREPASS_SCALE,
				MIN_PREPASS_SCALE,
				MAX_PREPASS_SCALE,
			),
			bloomScale: clamp(bloomScale ?? 0.35, 0.35, 0.75),
			maxDevicePixelRatio: maxDevicePixelRatio ?? 1,
		};
	}

	if (quality === "visual") {
		return {
			qualityValue: 1,
			initialPrepassScale: clamp(
				prepassScale ?? MAX_PREPASS_SCALE,
				MIN_PREPASS_SCALE,
				MAX_PREPASS_SCALE,
			),
			bloomScale: clamp(bloomScale ?? 0.67, 0.35, 0.75),
			maxDevicePixelRatio: maxDevicePixelRatio ?? 1.5,
		};
	}

	return {
		qualityValue: 0.72,
		initialPrepassScale: clamp(
			prepassScale ?? MIN_PREPASS_SCALE,
			MIN_PREPASS_SCALE,
			MAX_PREPASS_SCALE,
		),
		bloomScale: clamp(bloomScale ?? 0.4, 0.35, 0.75),
		maxDevicePixelRatio: maxDevicePixelRatio ?? 1.25,
	};
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
			uBlendWeight: gl.getUniformLocation(program, "uBlendWeight"),
			uBloomMode: gl.getUniformLocation(program, "uBloomMode"),
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

function chooseFallbackTextureFormat(
	gl: WebGL2RenderingContext,
): TextureFormat {
	return (
		chooseFloatTextureFormat(gl) ?? {
			internalFormat: gl.RGBA8,
			format: gl.RGBA,
			type: gl.UNSIGNED_BYTE,
			canFilterLinear: true,
		}
	);
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

	if (!texture || !framebuffer)
		throw new Error("Could not create render target.");

	const glFilter =
		filter === "linear" && format.canFilterLinear ? gl.LINEAR : gl.NEAREST;
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
		gl.deleteTexture(texture);
		gl.deleteFramebuffer(framebuffer);
		throw new Error("Render target framebuffer is incomplete.");
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

	try {
		for (let i = 0; i < count; i++) {
			const texture = gl.createTexture();
			if (!texture)
				throw new Error("Could not create multi render target texture.");

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

			const attachment = gl.COLOR_ATTACHMENT0 + i;
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				attachment,
				gl.TEXTURE_2D,
				texture,
				0,
			);
			attachments.push(attachment);
			textures.push({ texture, width, height });
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
	let read = createRenderTarget(gl, width, height, format, filter);
	let write = createRenderTarget(gl, width, height, format, filter);

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
	if (pass.locations.uBlendWeight)
		gl.uniform1f(pass.locations.uBlendWeight, blendWeight);
	if (pass.locations.uBloomMode)
		gl.uniform1i(pass.locations.uBloomMode, bloomMode);

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
			scale(normalize(moveDir), MOVE_SPEED * delta * speedScale),
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

export default function BlackHoleShader({
	className = "",
	quality = "balanced",
	resolutionScale = 1,
	prepassScale,
	bloomScale,
	maxDevicePixelRatio,
	debugStats = false,
}: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

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

		const settings = resolveQualitySettings({
			quality,
			prepassScale,
			bloomScale,
			maxDevicePixelRatio,
		});

		let disposed = false;
		let animationFrame = 0;
		let frame = 0;
		let mode: "optimized" | "fallback" = "optimized";
		let fallbackReason: string | null = null;
		let startTime = performance.now();
		let lastTime = startTime;
		let renderWidth = 1;
		let renderHeight = 1;
		let prepassWidth = 1;
		let prepassHeight = 1;
		let bloomWidth = 1;
		let bloomHeight = 1;
		let currentDpr = 1;
		let currentPrepassScale = settings.initialPrepassScale;
		let averageFrameTimeMs = 16.7;
		let lastRenderNow = 0;
		let keyboardDirty = true;
		let pointerActive = false;
		let lastPointerX = 0;
		let lastPointerY = 0;

		const keyboardData = new Uint8Array(256 * 4);
		const mouse = new Float32Array([0, 0, -1, -1]);
		const camera = createInitialCamera();
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const floatFormat = chooseFloatTextureFormat(gl);
		const fallbackFormat = chooseFallbackTextureFormat(gl);
		const fallbackTexture = createSolidTexture(gl, [0, 0, 0, 255]);
		const keyboardTexture = createKeyboardTexture(gl, keyboardData);
		const vertexBuffer = gl.createBuffer();
		const channelResolutionScratch = new Float32Array(12);

		if (!vertexBuffer) {
			setError("Could not create fullscreen vertex buffer.");
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
			};
		} catch (optimizedError) {
			mode = "fallback";
			fallbackReason = formatError(optimizedError);
		}

		if (mode === "fallback") {
			try {
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
				};
			} catch (fallbackError) {
				setError(formatError(fallbackError));
				gl.deleteBuffer(vertexBuffer);
				gl.deleteTexture(fallbackTexture.texture);
				gl.deleteTexture(keyboardTexture.texture);
				return;
			}
		}

		const disposeOptimizedTargets = () => {
			optimizedTargets?.prepass.dispose();
			optimizedTargets?.composite.dispose();
			disposeRenderTarget(gl, optimizedTargets?.bloomMip ?? null);
			disposeRenderTarget(gl, optimizedTargets?.bloomHorizontal ?? null);
			disposeRenderTarget(gl, optimizedTargets?.bloomVertical ?? null);
			optimizedTargets = null;
		};

		const disposeFallbackTargets = () => {
			fallbackTargets?.a.dispose();
			fallbackTargets?.b.dispose();
			disposeRenderTarget(gl, fallbackTargets?.c ?? null);
			disposeRenderTarget(gl, fallbackTargets?.d ?? null);
			fallbackTargets = null;
		};

		const disposeTargets = () => {
			disposeOptimizedTargets();
			disposeFallbackTargets();
		};

		const createOptimizedTargets = () => {
			if (!floatFormat) throw new Error("Float targets are unavailable.");
			const nextPrepassWidth = Math.max(
				2,
				Math.floor(renderWidth * currentPrepassScale),
			);
			const nextPrepassHeight = Math.max(
				2,
				Math.floor(renderHeight * currentPrepassScale),
			);
			const nextBloomWidth = Math.max(
				2,
				Math.floor(renderWidth * settings.bloomScale),
			);
			const nextBloomHeight = Math.max(
				2,
				Math.floor(renderHeight * settings.bloomScale),
			);

			prepassWidth = nextPrepassWidth;
			prepassHeight = nextPrepassHeight;
			bloomWidth = nextBloomWidth;
			bloomHeight = nextBloomHeight;

			optimizedTargets = {
				prepass: createMultiRenderTarget(
					gl,
					prepassWidth,
					prepassHeight,
					floatFormat,
					2,
				),
				composite: createPingPongTarget(
					gl,
					renderWidth,
					renderHeight,
					floatFormat,
					"linear",
				),
				bloomMip: createRenderTarget(
					gl,
					bloomWidth,
					bloomHeight,
					floatFormat,
					"linear",
				),
				bloomHorizontal: createRenderTarget(
					gl,
					bloomWidth,
					bloomHeight,
					floatFormat,
					"linear",
				),
				bloomVertical: createRenderTarget(
					gl,
					bloomWidth,
					bloomHeight,
					floatFormat,
					"linear",
				),
			};
		};

		const createFallbackTargets = () => {
			prepassWidth = renderWidth;
			prepassHeight = renderHeight;
			bloomWidth = renderWidth;
			bloomHeight = renderHeight;
			fallbackTargets = {
				a: createPingPongTarget(
					gl,
					renderWidth,
					renderHeight,
					fallbackFormat,
					"linear",
				),
				b: createPingPongTarget(
					gl,
					renderWidth,
					renderHeight,
					fallbackFormat,
					"linear",
				),
				c: createRenderTarget(
					gl,
					renderWidth,
					renderHeight,
					fallbackFormat,
					"linear",
				),
				d: createRenderTarget(
					gl,
					renderWidth,
					renderHeight,
					fallbackFormat,
					"linear",
				),
			};
		};

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			const dprCap =
				mode === "fallback"
					? Math.min(settings.maxDevicePixelRatio, DIRECT_FALLBACK_DPR)
					: settings.maxDevicePixelRatio;
			const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
			const nextWidth = Math.max(
				1,
				Math.floor(rect.width * dpr * resolutionScale),
			);
			const nextHeight = Math.max(
				1,
				Math.floor(rect.height * dpr * resolutionScale),
			);
			const nextPrepassWidth =
				mode === "optimized"
					? Math.max(2, Math.floor(nextWidth * currentPrepassScale))
					: nextWidth;
			const nextPrepassHeight =
				mode === "optimized"
					? Math.max(2, Math.floor(nextHeight * currentPrepassScale))
					: nextHeight;
			const nextBloomWidth =
				mode === "optimized"
					? Math.max(2, Math.floor(nextWidth * settings.bloomScale))
					: nextWidth;
			const nextBloomHeight =
				mode === "optimized"
					? Math.max(2, Math.floor(nextHeight * settings.bloomScale))
					: nextHeight;

			if (
				nextWidth === renderWidth &&
				nextHeight === renderHeight &&
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
				if (mode === "optimized") createOptimizedTargets();
				else createFallbackTargets();
			} catch (targetError) {
				if (mode === "optimized") {
					mode = "fallback";
					fallbackReason = formatError(targetError);
					disposeOptimizedTargets();
					if (!fallbackPasses) {
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
						};
					}
					createFallbackTargets();
				} else {
					throw targetError;
				}
			}

			frame = 0;
			startTime = performance.now();
			lastTime = startTime;
			lastRenderNow = 0;
		};

		const publishStats = (frameTimeMs: number) => {
			if (!debugStats && !import.meta.env.DEV) return;

			const stats: BlackHoleStats = {
				mode,
				frame,
				frameTimeMs,
				averageFrameTimeMs,
				dpr: currentDpr,
				prepassScale: currentPrepassScale,
				bloomScale: settings.bloomScale,
				renderWidth,
				renderHeight,
				prepassWidth,
				prepassHeight,
				bloomWidth,
				bloomHeight,
				fallbackReason,
			};

			window.__blackHoleStats = stats;
		};

		const maybeAdaptQuality = () => {
			if (
				mode !== "optimized" ||
				frame < 120 ||
				frame % 90 !== 0 ||
				prepassScale !== undefined
			)
				return;

			const previousScale = currentPrepassScale;
			if (averageFrameTimeMs > FRAME_TARGET_MS * 1.15) {
				currentPrepassScale = clamp(
					currentPrepassScale - 0.06,
					MIN_PREPASS_SCALE,
					MAX_PREPASS_SCALE,
				);
			}

			if (Math.abs(previousScale - currentPrepassScale) > 0.001) {
				disposeOptimizedTargets();
				createOptimizedTargets();
				frame = 0;
				startTime = performance.now();
				lastTime = startTime;
				lastRenderNow = 0;
			}
		};

		const renderOptimized = (
			time: number,
			delta: number,
			shouldUpdatePrepass: boolean,
			shouldUpdateBloom: boolean,
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
				);
			}

			renderPass(
				gl,
				optimizedPasses.composite,
				vertexBuffer,
				optimizedTargets.composite.write,
				renderWidth,
				renderHeight,
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
				);
			}

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
					optimizedTargets.bloomVertical,
				],
				camera,
				settings.qualityValue,
				0.5,
				0,
				channelResolutionScratch,
			);

			optimizedTargets.composite.swap();
		};

		const renderFallback = (time: number, delta: number) => {
			if (!fallbackPasses || !fallbackTargets) return;

			renderPass(
				gl,
				fallbackPasses.a,
				vertexBuffer,
				fallbackTargets.a.write,
				renderWidth,
				renderHeight,
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
			);
			renderPass(
				gl,
				fallbackPasses.b,
				vertexBuffer,
				fallbackTargets.b.write,
				renderWidth,
				renderHeight,
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
			);
			renderPass(
				gl,
				fallbackPasses.c,
				vertexBuffer,
				fallbackTargets.c,
				renderWidth,
				renderHeight,
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
			);
			renderPass(
				gl,
				fallbackPasses.d,
				vertexBuffer,
				fallbackTargets.d,
				renderWidth,
				renderHeight,
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
			);
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
			);

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

				const activeControls = hasActiveControls(keyboardData, pointerActive);
				if (
					mode === "optimized" &&
					frame > 2 &&
					!activeControls &&
					lastRenderNow > 0 &&
					now - lastRenderNow < IDLE_RENDER_INTERVAL_MS
				) {
					animationFrame = requestAnimationFrame(renderFrame);
					return;
				}
				lastRenderNow = now;

				const time = (now - startTime) / 1000;
				const delta = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
				lastTime = now;

				updateCamera(camera, keyboardData, delta);

				gl.disable(gl.DEPTH_TEST);
				gl.disable(gl.BLEND);
				gl.clearColor(0, 0, 0, 1);

				if (mode === "optimized") {
					const prepassStride = activeControls
						? ACTIVE_PREPASS_STRIDE
						: IDLE_PREPASS_STRIDE;
					const shouldUpdatePrepass = frame < 2 || frame % prepassStride === 0;
					const shouldUpdateBloom =
						frame < 2 ||
						shouldUpdatePrepass ||
						frame % BLOOM_FRAME_STRIDE === 0;

					renderOptimized(time, delta, shouldUpdatePrepass, shouldUpdateBloom);
				} else renderFallback(time, delta);

				const frameTimeMs = performance.now() - cpuFrameStart;
				averageFrameTimeMs = averageFrameTimeMs * 0.94 + delta * 1000 * 0.06;
				publishStats(frameTimeMs);
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
			if (!disposed && !animationFrame && !document.hidden) {
				animationFrame = requestAnimationFrame(renderFrame);
			}
		};

		const setKey = (event: KeyboardEvent, pressed: boolean) => {
			if (event.keyCode < 0 || event.keyCode > 255) return;
			if (CONTROL_KEY_CODES.has(event.keyCode)) event.preventDefault();
			keyboardData[event.keyCode * 4] = pressed ? 255 : 0;
			keyboardDirty = true;
			requestRender();
		};

		const pointerPosition = (event: PointerEvent) => {
			const rect = canvas.getBoundingClientRect();
			const x =
				((event.clientX - rect.left) / Math.max(rect.width, 1)) * renderWidth;
			const y =
				((rect.bottom - event.clientY) / Math.max(rect.height, 1)) *
				renderHeight;
			mouse[0] = x;
			mouse[1] = y;
		};

		const handlePointerDown = (event: PointerEvent) => {
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
			pointerPosition(event);
			if (pointerActive) {
				const dx = event.clientX - lastPointerX;
				const dy = event.clientY - lastPointerY;
				lastPointerX = event.clientX;
				lastPointerY = event.clientY;
				camera.pendingYaw += -dx * MOUSE_SENSITIVITY;
				camera.pendingPitch += dy * MOUSE_SENSITIVITY;
			}
			requestRender();
		};

		const handlePointerUp = (event: PointerEvent) => {
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

		const resizeObserver = new ResizeObserver(requestRender);
		resizeObserver.observe(canvas);

		const handleKeyDown = (event: KeyboardEvent) => setKey(event, true);
		const handleKeyUp = (event: KeyboardEvent) => setKey(event, false);

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		canvas.addEventListener("pointerdown", handlePointerDown);
		canvas.addEventListener("pointermove", handlePointerMove);
		canvas.addEventListener("pointerup", handlePointerUp);
		canvas.addEventListener("pointercancel", handlePointerUp);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		requestRender();

		return () => {
			disposed = true;
			if (animationFrame) cancelAnimationFrame(animationFrame);
			resizeObserver.disconnect();
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			canvas.removeEventListener("pointerdown", handlePointerDown);
			canvas.removeEventListener("pointermove", handlePointerMove);
			canvas.removeEventListener("pointerup", handlePointerUp);
			canvas.removeEventListener("pointercancel", handlePointerUp);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
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
			delete window.__blackHoleStats;
		};
	}, [
		quality,
		resolutionScale,
		prepassScale,
		bloomScale,
		maxDevicePixelRatio,
		debugStats,
	]);

	return (
		<div className={`relative h-full w-full bg-black ${className}`}>
			<canvas
				ref={canvasRef}
				className="block h-full w-full cursor-crosshair touch-none bg-black"
				aria-label="Interactive black hole shader"
			/>
			{error ? (
				<div className="absolute inset-x-4 bottom-4 border border-red-500/60 bg-black/85 p-3 font-mono text-xs text-red-200">
					{error}
				</div>
			) : null}
		</div>
	);
}
