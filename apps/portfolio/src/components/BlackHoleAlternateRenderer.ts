import { normalizeBlackHoleAnimationRoute } from "../config/black-hole-animation";
import asciiSource from "../shaders/black-hole/ascii.glsl?raw";
import {
	type AnimationMode,
	animationKeyframeFromCamera,
	type BlackHoleStats,
	chooseByteTextureFormat,
	cloneVec3,
	copyVec3Into,
	createBlackHoleFragmentSource,
	createGlyphAtlasConfig,
	createGlyphAtlasRaster,
	createGlyphTextureSet,
	createInitialCamera,
	createPass,
	createRenderTarget,
	createRenderUniforms,
	createSolidTexture,
	createStandardFragmentSource,
	disposeRenderTarget,
	estimateTextureMemoryBytes,
	formatError,
	glyphControlsKey,
	isControlKeyboardTarget,
	isWebGpuAvailable,
	length,
	MAX_GLYPH_ATLAS_DIMENSION,
	MOUSE_SENSITIVITY,
	MOVE_SPEED,
	parseCameraVec3,
	parseUniverseSign,
	type QualityPreset,
	type RendererMode,
	type RenderTarget,
	type ResolvedRendererMode,
	type ResolvedShaderBackend,
	type RuntimeProfile,
	renderPass,
	type ShaderBackend,
	setCameraForward,
	stringifyAnimationValue,
	updateCamera,
	writeRenderUniforms,
} from "./BlackHoleCore";
import type { RuntimeOptions, RuntimeState } from "./BlackHoleRuntime";

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

type AlternateRendererContext = {
	state: RuntimeState;
	onCameraReadout: RuntimeOptions["onCameraReadout"];
	runtimeProfile: RuntimeProfile;
	animationMode: AnimationMode;
	resolvedRendererMode: ResolvedRendererMode;
	resolvedBackend: ResolvedShaderBackend;

	debugStats: boolean;
	showControls: boolean;

	rendererModeState: RendererMode;

	canvas: HTMLCanvasElement;
	settings: {
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
		asciiEnabled: boolean;
		qualityPreset: QualityPreset;
	};

	interactive: boolean;
	setError: (error: string | null) => void;
	asciiMix: number;
	onContextRestored: () => void;
	setupStart: number;
	setBackendState: (backend: ShaderBackend) => void;
};

export function startAlternateRenderer(context: AlternateRendererContext) {
	const {
		state,
		onCameraReadout,
		runtimeProfile,
		animationMode,
		resolvedRendererMode,
		resolvedBackend,

		debugStats,
		showControls,

		rendererModeState,

		canvas,
		settings,

		interactive,
		setError,
		asciiMix,
		onContextRestored,
		setupStart,
		setBackendState,
	} = context;
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
		let shaderTime = state.runtimeSnapshot.shaderTime ?? 0;
		let averageFrameTimeMs = 16.7;
		let cpuAverageFrameTimeMs = 16.7;
		let lastStatsPublish = 0;
		let pointerActive = false;
		let lastPointerX = 0;
		let lastPointerY = 0;
		let contextLost = false;
		let initTimeMs = 0;
		const frameTimes: number[] = [];
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const keyboardData = new Uint8Array(256 * 4);
		const mouse = new Float32Array([0, 0, -1, -1]);
		const camera = createInitialCamera({
			position:
				state.runtimeSnapshot.cameraPosition ??
				state.initialProps.initialCameraPosition,
			forward:
				state.runtimeSnapshot.cameraForward ??
				state.initialProps.initialCameraForward,
			universeSign:
				state.runtimeSnapshot.universeSign ??
				state.initialProps.initialUniverseSign,
		});
		const movementSpeed = state.runtimeSnapshot.movementSpeed ?? MOVE_SPEED;
		let activeAsciiBackend = resolvedBackend;
		let fallbackReason: string | null =
			resolvedBackend === "webgpu" && !isWebGpuAvailable()
				? "WebGPU is not available in this browser."
				: null;

		const snapshotRuntime = (now = performance.now()) => {
			const snapshot = state.runtimeSnapshot;
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
			const activeAtlas = state.atlasConfig;
			const activeControls = state.controls;
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
				reactRenderCount: state.reactRenderCount,
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
				animationRoute: normalizeBlackHoleAnimationRoute(state.animationRoute),
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
			if (showControls) onCameraReadout?.(camera, force);
		};

		state.cameraEditor = {
			applyPosition: (value: string) => {
				const nextPosition = parseCameraVec3(value);
				if (!nextPosition) {
					writeCameraReadout(true);
					return false;
				}
				camera.position = nextPosition;
				snapshotRuntime();
				writeCameraReadout(true);
				state.requestRender();
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
				state.requestRender();
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
				state.requestRender();
				return true;
			},
			sync: () => writeCameraReadout(true),
		};

		state.animationEditor = {
			play: () => {},
			pause: () => {},
			restartIntro: () => {},
			previewIdle: () => {},
			setRoute: () => {},
			currentKeyframe: () =>
				stringifyAnimationValue(
					animationKeyframeFromCamera(camera, state.controls, true, 2.5),
				),
			routeConfig: () => "",
		};

		const setKey = (event: KeyboardEvent, pressed: boolean) => {
			if (!interactive) return;
			if (isControlKeyboardTarget(event.target)) return;
			if (event.keyCode < 0 || event.keyCode > 255) return;
			keyboardData[event.keyCode * 4] = pressed ? 255 : 0;
			state.requestRender();
		};

		const handlePointerDown = (event: PointerEvent) => {
			if (!interactive) return;
			pointerActive = true;
			lastPointerX = event.clientX;
			lastPointerY = event.clientY;
			canvas.setPointerCapture?.(event.pointerId);
			state.requestRender();
		};
		const handlePointerMove = (event: PointerEvent) => {
			if (!interactive || !pointerActive) return;
			const direction = state.controls.invertControls ? -1 : 1;
			camera.pendingYaw -=
				(event.clientX - lastPointerX) * MOUSE_SENSITIVITY * direction;
			camera.pendingPitch -=
				(event.clientY - lastPointerY) * MOUSE_SENSITIVITY * direction;
			lastPointerX = event.clientX;
			lastPointerY = event.clientY;
			state.requestRender();
		};
		const handlePointerUp = (event: PointerEvent) => {
			pointerActive = false;
			canvas.releasePointerCapture?.(event.pointerId);
			state.requestRender();
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
			let glyphAtlasConfig = state.atlasConfig;
			let liveGlyphControlsKey = glyphControlsKey(state.controls);
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
				state.controls,
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
					Math.max(1, Math.floor(rect.width * dpr * settings.resolutionScale)),
				);
				const nextHeight = Math.min(
					maxTextureSize,
					Math.max(1, Math.floor(rect.height * dpr * settings.resolutionScale)),
				);
				const nextCellWidth = Math.min(
					maxTextureSize,
					Math.max(1, Math.ceil(nextWidth / Math.max(2, settings.cellWidth))),
				);
				const nextCellHeight = Math.min(
					maxTextureSize,
					Math.max(1, Math.ceil(nextHeight / Math.max(2, settings.cellHeight))),
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
					const delta = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
					lastTime = now;
					lastRenderNow = now;
					const liveControls = state.controls;
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
						fallbackTexture,
						fallbackTexture,
						fallbackTexture,
						fallbackTexture,
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
						cellTarget,
						glyphTextures.atlas,
						glyphTextures.metrics,
						fallbackTexture,
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
					averageFrameTimeMs = averageFrameTimeMs * 0.94 + delta * 1000 * 0.06;
					publishStats(
						frameTimeMs,
						now,
						2,
						estimateTextureMemoryBytes(cellTextureWidth, cellTextureHeight, 4) +
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
				if (!disposed && !contextLost && !animationFrame && !document.hidden) {
					animationFrame = requestAnimationFrame(renderFrame);
				}
			};
			state.requestRender = requestRender;

			const handleContextLost = (event: Event) => {
				event.preventDefault();
				contextLost = true;
				setError("WebGL context lost. Restoring ASCII-cell renderer...");
			};
			const handleContextRestored = () => {
				contextLost = false;
				setError(null);
				onContextRestored();
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
				gl.deleteVertexArray(cellPass.vao);
				gl.deleteProgram(cellPass.program);
				gl.deleteVertexArray(asciiPass.vao);
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
			if (!context) throw new Error("Could not create WebGPU canvas context.");
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
			let glyphAtlasConfig = state.atlasConfig;
			let liveGlyphControlsKey = glyphControlsKey(state.controls);
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
				const activeControls = state.controls;
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
					const delta = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
					lastTime = now;
					lastRenderNow = now;
					const liveControls = state.controls;
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
					averageFrameTimeMs = averageFrameTimeMs * 0.94 + delta * 1000 * 0.06;
					publishStats(
						frameTimeMs,
						now,
						2,
						estimateTextureMemoryBytes(cellTextureWidth, cellTextureHeight, 4) +
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
			state.requestRender = requestRender;
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

		const handleVisibility = () => {
			if (document.hidden) {
				if (animationFrame) cancelAnimationFrame(animationFrame);
				animationFrame = 0;
			} else {
				lastTime = performance.now();
				state.requestRender();
			}
		};
		document.addEventListener("visibilitychange", handleVisibility);
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
					if (disposed) return;
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
			document.removeEventListener("visibilitychange", handleVisibility);
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
			state.requestRender = () => {};
			state.cameraEditor = {
				applyPosition: () => false,
				applyForward: () => false,
				applyUniverse: () => false,
				sync: () => {},
			};
		};
	}
}
