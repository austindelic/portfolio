import { asciiSourceDimension } from "../lib/ascii-analysis";
import { disposeProgramPass } from "./BlackHoleCore";
import {
	BLACK_HOLE_ANIMATION_ROUTES,
	type BlackHoleAnimationKeyframe,
	type BlackHoleAnimationRouteKey,
	getBlackHoleRouteAnimation,
	normalizeBlackHoleAnimationRoute,
} from "../config/black-hole-animation";
import asciiSource from "../shaders/black-hole/ascii.glsl?raw";
import bufferASource from "../shaders/black-hole/buffer-a.glsl?raw";
import bufferBSource from "../shaders/black-hole/buffer-b.glsl?raw";
import bufferCSource from "../shaders/black-hole/buffer-c.glsl?raw";
import bufferDSource from "../shaders/black-hole/buffer-d.glsl?raw";
import imageSource from "../shaders/black-hole/image.glsl?raw";
import { submitPrograms } from "./BlackHoleCompilation";
import {
	type AnimationEditorApi,
	type AnimationMode,
	type AnimationPhase,
	animationKeyframeFromCamera,
	applyAnimationCamera,
	type BlackHoleStats,
	buildRouteTransitionSequence,
	type CameraEditorApi,
	type CameraState,
	CONTROL_KEY_CODES,
	chooseFallbackTextureFormat,
	cloneVec3,
	copyVec3Into,
	createGlyphAtlasConfig,
	createGlyphTextureSet,
	createInitialCamera,
	createInitialControls,
	createKeyboardTexture,
	createPingPongTarget,
	createRenderSettingsFromQuality,
	createRenderTarget,
	createRenderUniforms,
	createSolidTexture,
	createStandardFragmentSource,
	DEFAULT_ASCII_CELL_SIZE,
	DIRECT_FALLBACK_DPR,
	detectRuntimeProfile,
	disposeRenderTarget,
	estimateTextureMemoryBytes,
	evaluateAnimationSequenceInto,
	type FallbackPassSet,
	type FallbackTargets,
	formatError,
	type GlyphAtlasConfig,
	glyphControlsKey,
	initializePass,
	isControlKeyboardTarget,
	isWebGpuAvailable,
	length,
	MAX_GLYPH_ATLAS_DIMENSION,
	MOUSE_SENSITIVITY,
	MOVE_SPEED,
	MOVE_SPEED_FACTOR,
	type Props,
	parseCameraVec3,
	parseUniverseSign,
	type RendererMode,
	type RenderSettings,
	type RenderUniforms,
	type RuntimeSnapshot,
	renderPass,
	resolveRendererMode,
	resolveRenderSettings,
	resolveShaderBackend,
	type ShaderBackend,
	type ShaderControls,
	setCameraForward,
	stringifyAnimationValue,
	TARGET_ALLOCATION_SCALE_STEPS,
	updateCamera,
	updateKeyboardTexture,
	VERTEX_SOURCE,
	writeAnimationControlsFromFrame,
	writeRenderUniforms,
} from "./BlackHoleCore";

export type RuntimeState = {
	animationAutoplay: boolean;
	animationEditor: AnimationEditorApi;
	animationMode: AnimationMode;
	animationPlaying: boolean;
	animationRoute: string;
	atlasConfig: GlyphAtlasConfig;
	cameraEditor: CameraEditorApi;
	controls: ShaderControls;
	initialProps: Props;
	reactRenderCount: number;
	requestRender: () => void;
	resetFrame: () => void;
	runtimeSnapshot: RuntimeSnapshot;
};
export type RuntimeOptions = {
	renderSettings: RenderSettings;
	asciiMix: number;
	showControls: boolean;
	interactive: boolean;
	debugStats: boolean;
	rendererModeState: RendererMode;
	backendState: ShaderBackend;
	animationMode: AnimationMode;
	onReady?: () => void;
	onError: (error: string | null) => void;
	onContextRestored: () => void;
	onBackend: (backend: ShaderBackend) => void;
	onAnimationStatus?: (status: string) => void;
	onAnimationPlaying?: (playing: boolean) => void;
	onCameraReadout?: (camera: CameraState, force: boolean) => void;
};
function startBlackHoleSession(
	canvas: HTMLCanvasElement,
	state: RuntimeState,
	options: RuntimeOptions,
) {
	const {
		renderSettings,
		asciiMix,
		showControls,
		interactive,
		debugStats,
		rendererModeState,
		backendState,
		animationMode,
	} = options;

	const settings = resolveRenderSettings(renderSettings);
	const runtimeProfile = detectRuntimeProfile();
	const resolvedRendererMode = resolveRendererMode(rendererModeState);
	const resolvedBackend = resolveShaderBackend(
		backendState,
		resolvedRendererMode,
	);
	const setupStart = performance.now();

	if (resolvedRendererMode === "ascii-cell" || resolvedBackend === "webgpu") {
		let cancelled = false;
		let cleanup: (() => void) | undefined;
		void import("./BlackHoleAlternateRenderer")
			.then(({ startAlternateRenderer }) => {
				if (cancelled) return;
				cleanup = startAlternateRenderer({
					state,
					onCameraReadout: options.onCameraReadout,
					onReady: options.onReady,
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
					setError: options.onError,
					asciiMix,
					onContextRestored: options.onContextRestored,
					setupStart,
					setBackendState: options.onBackend,
				});
			})
			.catch((error) => {
				if (!cancelled) options.onError(formatError(error));
			});
		return () => {
			cancelled = true;
			cleanup?.();
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
		options.onError("WebGL2 is not available in this browser.");
		return;
	}

	gl.disable(gl.DEPTH_TEST);
	gl.disable(gl.BLEND);
	gl.clearColor(0, 0, 0, 1);

	let perfSearch = "";
	let perfFlags = new Set<string>();
	const rootPerfFlagActive = (flag: string) => {
		if (window.location.pathname !== "/") return false;
		if (window.location.search !== perfSearch) {
			perfSearch = window.location.search;
			perfFlags = new Set(
				(new URLSearchParams(perfSearch).get("bhPerf") ?? "")
					.split(",")
					.map((value) => value.trim()),
			);
		}
		return perfFlags.has(flag);
	};
	const activeAnimationMode = (): AnimationMode =>
		state.animationMode === "route" && rootPerfFlagActive("no-route-animation")
			? "off"
			: state.animationMode;
	const activeAnimationAutoplay = () =>
		activeAnimationMode() !== "off" && state.animationAutoplay;
	let cachedRouteSource: string | undefined;
	let cachedRoute: BlackHoleAnimationRouteKey = "/";
	const currentAnimationRoute = () => {
		const source =
			activeAnimationMode() === "editor"
				? state.animationRoute
				: window.location.pathname || state.animationRoute;
		if (source !== cachedRouteSource) {
			cachedRouteSource = source;
			cachedRoute = normalizeBlackHoleAnimationRoute(source);
		}
		return cachedRoute;
	};
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
	let resetFrameRequested = false;
	state.resetFrame = () => {
		resetFrameRequested = true;
		state.requestRender();
	};
	// Preserve the full pipeline already displayed by every WebGL2 route.
	// The former prepass setup always failed (undefined scale), then rebuilt this pipeline.
	const mode = "fallback";
	const fallbackReason: string | null =
		rendererModeState === "fallback-full"
			? "Forced fallback renderer selected."
			: null;
	let startTime = performance.now();
	let lastTime = startTime;
	let shaderTime =
		state.runtimeSnapshot.shaderTime ??
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

	let averageFrameTimeMs = 16.7;
	let cpuAverageFrameTimeMs = 16.7;
	let initTimeMs = 0;
	let lastStatsPublish = 0;
	let lastRuntimeSnapshotUpdate = 0;
	let lastPersistentSnapshotUpdate = 0;
	let keyboardDirty = true;
	let pointerActive = false;
	let lastPointerX = 0;
	let lastPointerY = 0;
	let lastCameraReadoutUpdate = 0;
	let movementSpeed =
		state.runtimeSnapshot.movementSpeed ??
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
			state.runtimeSnapshot.cameraPosition ??
			persistedAnimationSnapshot?.cameraPosition ??
			state.initialProps.initialCameraPosition,
		forward:
			routeIntroStartFrame?.forward ??
			state.runtimeSnapshot.cameraForward ??
			persistedAnimationSnapshot?.cameraForward ??
			state.initialProps.initialCameraForward,
		universeSign:
			routeIntroStartFrame?.universeSign ??
			state.runtimeSnapshot.universeSign ??
			persistedAnimationSnapshot?.universeSign ??
			state.initialProps.initialUniverseSign,
	});

	const snapshotRuntime = (
		forcePersistent = false,
		now = performance.now(),
	) => {
		if (!forcePersistent && now - lastRuntimeSnapshotUpdate < 250) return;
		lastRuntimeSnapshotUpdate = now;

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

	const fallbackFormat = chooseFallbackTextureFormat(gl);
	const fallbackTexture = createSolidTexture(gl, [0, 0, 0, 255]);
	const keyboardTexture = createKeyboardTexture(gl, keyboardData);
	let glyphAtlasConfig = state.atlasConfig;
	let liveGlyphControlsKey = glyphControlsKey(state.controls);
	let glyphTextures = createGlyphTextureSet(gl, glyphAtlasConfig);
	const vertexBuffer = gl.createBuffer();
	const channelResolutionScratch = new Float32Array(12);

	if (!vertexBuffer) {
		options.onError("Could not create fullscreen vertex buffer.");
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

	let fallbackPasses: FallbackPassSet | null = null;

	let fallbackTargets: FallbackTargets | null = null;
	let contextLost = false;

	let pendingPrograms: ReturnType<typeof submitPrograms> | undefined;
	let compilationTimer: ReturnType<typeof setTimeout> | undefined;
	const submitFallbackPasses = () => {
		pendingPrograms = submitPrograms(
			gl,
			[
				["Buffer A", bufferASource],
				["Image", imageSource],
				[
					"ASCII",
					imageSource.slice(0, imageSource.indexOf("void mainImage")) +
						asciiSource,
				],
			].map(([name, source]) => ({
				name,
				vertex: VERTEX_SOURCE,
				fragment: createStandardFragmentSource(name, source),
			})),
		);
	};

	const writeCameraReadout = (force = false) => {
		if (showControls) options.onCameraReadout?.(camera, force);
	};

	const updateCameraReadout = (now: number, force = false) => {
		if (!showControls) return;
		if (!force && now - lastCameraReadoutUpdate < 250) return;
		lastCameraReadoutUpdate = now;
		writeCameraReadout(force);
	};

	state.cameraEditor = {
		applyPosition: (value: string) => {
			const nextPosition = parseCameraVec3(value);
			if (!nextPosition) {
				writeCameraReadout(true);
				return false;
			}
			camera.position = nextPosition;
			camera.asciiHistoryVersion = (camera.asciiHistoryVersion ?? 0) + 1;
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
			camera.asciiHistoryVersion = (camera.asciiHistoryVersion ?? 0) + 1;
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
			camera.asciiHistoryVersion = (camera.asciiHistoryVersion ?? 0) + 1;
			snapshotRuntime();
			writeCameraReadout(true);
			requestRender();
			return true;
		},
		sync: () => writeCameraReadout(true),
	};
	try {
		submitFallbackPasses();
	} catch (fallbackError) {
		options.onError(formatError(fallbackError));
		gl.deleteBuffer(vertexBuffer);
		gl.deleteTexture(fallbackTexture.texture);
		gl.deleteTexture(keyboardTexture.texture);
		glyphTextures.dispose();
		return;
	}

	const disposeFallbackTargets = () => {
		fallbackTargets?.a.dispose();
		disposeRenderTarget(gl, fallbackTargets?.b ?? null);
		disposeRenderTarget(gl, fallbackTargets?.c ?? null);
		disposeRenderTarget(gl, fallbackTargets?.d ?? null);
		disposeRenderTarget(gl, fallbackTargets?.scene ?? null);
		fallbackTargets = null;
	};

	const disposeTargets = () => {
		disposeFallbackTargets();
	};

	const disposeFallbackTargetGroup = (targets: Partial<FallbackTargets>) => {
		targets.a?.dispose();
		disposeRenderTarget(gl, targets.b ?? null);
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
	const lastAnimatedControls: ShaderControls = { ...state.controls };
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
		options.onAnimationStatus?.(status);
	};

	const setAnimationPlaying = (playing: boolean) => {
		state.animationPlaying = playing;
		if (showControls) options.onAnimationPlaying?.(playing);
	};

	const animationIsEnabled = () => activeAnimationMode() !== "off";

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
			state.controls,
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
			state.controls,
			idleFrame,
		);
		lastAnimatedAsciiEnabled = idleFrame?.asciiEnabled ?? settings.asciiEnabled;
		publishAnimationStatus(`${route} reduced motion`);
	};

	const syncAnimationRoute = () => {
		if (!animationIsEnabled()) return;
		const nextRoute = currentAnimationRoute();
		if (activeAnimationMode() === "editor") {
			if (nextRoute !== activeAnimationRoute && animationPhase !== "off") {
				startIntro(nextRoute, state.animationPlaying);
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
				controls: state.controls,
				asciiEnabled: settings.asciiEnabled,
				active: false,
			};
		}

		syncAnimationRoute();

		if (reducedMotion.matches) {
			applyReducedMotionAnimation();
		}

		if (state.animationPlaying && !animationSequenceJustStarted) {
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
				baseControls: state.controls,
				baseAsciiEnabled: settings.asciiEnabled,
			},
		);

		animationFrameIndex = result.frameIndex;
		animationSequenceTime = result.sequenceTime;
		applyAnimationCamera(camera, result.frame);
		writeAnimationControlsFromFrame(
			lastAnimatedControls,
			state.controls,
			result.frame,
		);
		lastAnimatedAsciiEnabled =
			result.frame?.asciiEnabled ?? settings.asciiEnabled;

		if (result.done && state.animationPlaying && !animationSequenceLoops) {
			finishAnimationPhase();
		}

		return {
			controls: lastAnimatedControls,
			asciiEnabled: lastAnimatedAsciiEnabled,
			active: animationPhase !== "off",
		};
	};

	state.animationEditor = {
		play: () => {
			if (!animationIsEnabled()) return;
			if (animationPhase === "off") {
				startIntro(
					normalizeBlackHoleAnimationRoute(state.animationRoute),
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
			startIntro(normalizeBlackHoleAnimationRoute(state.animationRoute), true);
			requestRender();
		},
		previewIdle: () => {
			startIdle(normalizeBlackHoleAnimationRoute(state.animationRoute), true);
			requestRender();
		},
		setRoute: (route) => {
			activeAnimationRoute = route;
			if (activeAnimationMode() === "editor") {
				startIntro(route, state.animationPlaying);
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

	const createFallbackTargets = () => {
		sceneWidth = allocatedTargetDimension(
			asciiSourceDimension(
				renderWidth,
				Math.min(state.atlasConfig.cellSize.x, state.atlasConfig.cellSize.y),
				settings.qualityValue,
				settings.sceneScale,
			),
		);
		sceneHeight = allocatedTargetDimension(
			asciiSourceDimension(
				renderHeight,
				Math.min(state.atlasConfig.cellSize.x, state.atlasConfig.cellSize.y),
				settings.qualityValue,
				settings.sceneScale,
			),
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

	let sizeDirty = true;
	let measuredDpr = 0;
	const resize = () => {
		const deviceDpr = window.devicePixelRatio || 1;
		if (!sizeDirty && measuredDpr === deviceDpr) return;
		sizeDirty = false;
		measuredDpr = deviceDpr;
		const rect = canvas.getBoundingClientRect();
		const dprCap = Math.min(settings.maxDevicePixelRatio, DIRECT_FALLBACK_DPR);
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
			asciiSourceDimension(
				nextWidth,
				Math.min(state.atlasConfig.cellSize.x, state.atlasConfig.cellSize.y),
				settings.qualityValue,
				settings.sceneScale,
			),
		);
		const nextSceneHeight = allocatedTargetDimension(
			asciiSourceDimension(
				nextHeight,
				Math.min(state.atlasConfig.cellSize.x, state.atlasConfig.cellSize.y),
				settings.qualityValue,
				settings.sceneScale,
			),
		);
		const nextPrepassWidth = nextSceneWidth;
		const nextPrepassHeight = nextSceneHeight;
		const nextBloomWidth = nextSceneWidth;
		const nextBloomHeight = nextSceneHeight;

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

		createTargetsWithRetry(createFallbackTargets);

		frame = 0;
		startTime = performance.now();
		lastTime = startTime;
		shaderTime = 0;
	};

	const publishStats = (frameTimeMs: number, now: number) => {
		if (!debugStats && !import.meta.env.DEV && !showControls) return;
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
			reactRenderCount: state.reactRenderCount,
			dpr: currentDpr,
			targetAllocationScale,
			prepassScale: 1,
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
			passCount:
				2 +
				2 * Number(lastAnimatedAsciiEnabled) +
				(activeControls.bloomStrength !== 0 ? 3 : 0),
			estimatedTextureMemoryBytes:
				(lastAnimatedAsciiEnabled
					? estimateTextureMemoryBytes(
							Math.ceil(renderWidth / activeAtlas.cellSize.x),
							Math.ceil(renderHeight / activeAtlas.cellSize.y),
							16,
						)
					: 0) +
				estimateTextureMemoryBytes(
					sceneWidth,
					sceneHeight,
					fallbackFormat.type === gl.HALF_FLOAT ? 8 : 4,
					3 +
						Number(Boolean(fallbackTargets?.b)) +
						Number(Boolean(fallbackTargets?.c)) +
						Number(Boolean(fallbackTargets?.d)),
				),
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
			animationPlaying: state.animationPlaying,
			animationFrameIndex,
			animationSequenceTime,
		};

		window.__blackHoleStats = stats;
	};

	const ensureBloomTargets = () => {
		if (!fallbackTargets) return;
		fallbackTargets.b ??= createRenderTarget(
			gl,
			sceneWidth,
			sceneHeight,
			fallbackFormat,
			"linear",
		);
		fallbackTargets.c ??= createRenderTarget(
			gl,
			sceneWidth,
			sceneHeight,
			fallbackFormat,
			"linear",
		);
		fallbackTargets.d ??= createRenderTarget(
			gl,
			sceneWidth,
			sceneHeight,
			fallbackFormat,
			"linear",
		);
	};

	const renderFallback = (
		time: number,
		delta: number,
		activeRenderUniforms: RenderUniforms,
		activeAsciiEnabled: boolean,
	) => {
		if (!fallbackPasses || !fallbackTargets) return;

		if (activeRenderUniforms.bloomStrength !== 0 && !fallbackTargets.d) {
			try {
				ensureBloomTargets();
			} catch {
				// Lazy bloom allocation needs the same fallback as initial allocation.
				createTargetsWithRetry(() => {
					createFallbackTargets();
					ensureBloomTargets();
				});
			}
		}

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
			keyboardTexture,
			fallbackTexture,
			fallbackTexture,
			fallbackTargets.a.read,
			camera,
			settings.qualityValue,
			0.5,
			0,
			channelResolutionScratch,
			activeRenderUniforms,
		);
		// These passes only feed bloom; camera state is CPU-owned.
		if (activeRenderUniforms.bloomStrength !== 0) {
			if (!fallbackPasses.b || !fallbackPasses.c || !fallbackPasses.d) {
				const batch = submitPrograms(
					gl,
					[
						["Buffer B", bufferBSource],
						["Buffer C", bufferCSource],
						["Buffer D", bufferDSource],
					].map(([name, source]) => ({
						name,
						vertex: VERTEX_SOURCE,
						fragment: createStandardFragmentSource(name, source),
					})),
				);
				// Editor changes can arrive immediately before a contributing frame. Submit
				// together, then synchronously finish rather than briefly dropping bloom.
				const programs = batch.finish(true);
				if (!programs) throw new Error("Shader compilation was cancelled.");
				try {
					fallbackPasses.b = initializePass(gl, "Buffer B", programs[0]);
					fallbackPasses.c = initializePass(gl, "Buffer C", programs[1]);
					fallbackPasses.d = initializePass(gl, "Buffer D", programs[2]);
				} catch (error) {
					for (const program of programs) gl.deleteProgram(program);
					fallbackPasses.b = fallbackPasses.c = fallbackPasses.d = undefined;
					throw error;
				}
			}

			renderPass(
				gl,
				fallbackPasses.b,
				vertexBuffer,
				fallbackTargets.b ?? null,
				sceneWidth,
				sceneHeight,
				time,
				delta,
				frame,
				mouse,
				fallbackTargets.a.write,
				fallbackTexture,
				fallbackTexture,
				keyboardTexture,
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
				fallbackTargets.c ?? null,
				sceneWidth,
				sceneHeight,
				time,
				delta,
				frame,
				mouse,
				fallbackTargets.b ?? fallbackTexture,
				fallbackTexture,
				fallbackTexture,
				fallbackTexture,
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
				fallbackTargets.d ?? null,
				sceneWidth,
				sceneHeight,
				time,
				delta,
				frame,
				mouse,
				fallbackTargets.c ?? fallbackTexture,
				fallbackTexture,
				fallbackTexture,
				fallbackTexture,
				camera,
				settings.qualityValue,
				0.5,
				0,
				channelResolutionScratch,
				activeRenderUniforms,
			);
		}
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
				fallbackTargets.a.write,
				fallbackTargets.b ?? fallbackTexture,
				fallbackTargets.c ?? fallbackTexture,
				fallbackTargets.d ?? fallbackTexture,
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
				fallbackTargets.scene,
				glyphTextures.atlas,
				glyphTextures.metrics,
				settings.enableBloomPass
					? (fallbackTargets.d ?? fallbackTexture)
					: fallbackTexture,
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
				fallbackTargets.a.write,
				fallbackTargets.b ?? fallbackTexture,
				fallbackTargets.c ?? fallbackTexture,
				fallbackTargets.d ?? fallbackTexture,
				camera,
				settings.qualityValue,
				0.5,
				0,
				channelResolutionScratch,
				activeRenderUniforms,
			);
		}

		fallbackTargets.a.swap();
	};

	const renderFrame = (now: number) => {
		if (disposed) return;

		const cpuFrameStart = performance.now();
		animationFrame = 0;

		try {
			if (resetFrameRequested) {
				frame = 0;
				shaderTime = 0;
				lastTime = now;
				resetFrameRequested = false;
			}
			resize();

			if (keyboardDirty) {
				updateKeyboardTexture(gl, keyboardTexture, keyboardData);
				keyboardDirty = false;
			}

			syncAnimationRoute();

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

			renderFallback(
				shaderTime,
				shaderDelta,
				activeRenderUniforms,
				activeAsciiEnabled,
			);

			const frameTimeMs = performance.now() - cpuFrameStart;
			cpuAverageFrameTimeMs = cpuAverageFrameTimeMs * 0.94 + frameTimeMs * 0.06;
			averageFrameTimeMs = averageFrameTimeMs * 0.94 + delta * 1000 * 0.06;
			publishStats(frameTimeMs, now);
			updateCameraReadout(now);

			if (frame === 0) options.onReady?.();
			frame += 1;
		} catch (renderError) {
			options.onError(formatError(renderError));
			disposed = true;
			disposeGpuResources();
			return;
		}

		if (!document.hidden && !reducedMotion.matches) {
			animationFrame = requestAnimationFrame(renderFrame);
		}
	};

	const requestRender = () => {
		if (
			!disposed &&
			fallbackPasses &&
			!contextLost &&
			!animationFrame &&
			!document.hidden
		) {
			animationFrame = requestAnimationFrame(renderFrame);
		}
	};
	state.requestRender = requestRender;

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
			((rect.bottom - event.clientY) / Math.max(rect.height, 1)) * mouseHeight;
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
				(state.controls.invertControls ? dy : -dy) * MOUSE_SENSITIVITY;
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

	let gpuResourcesDisposed = false;
	const disposeGpuResources = () => {
		if (gpuResourcesDisposed) return;
		gpuResourcesDisposed = true;
		clearTimeout(compilationTimer);
		pendingPrograms?.cancel();
		pendingPrograms = undefined;
		disposeTargets();
		gl.deleteBuffer(vertexBuffer);
		gl.deleteTexture(fallbackTexture.texture);
		gl.deleteTexture(keyboardTexture.texture);
		Object.values(fallbackPasses ?? {}).forEach((pass) => {
			if (!pass) return;
			disposeProgramPass(gl, pass);
		});
		glyphTextures.dispose();
	};

	const handleContextLost = (event: Event) => {
		event.preventDefault();
		contextLost = true;
		disposed = true;
		// Release handles while the context is lost, before restoration makes
		// the old objects invalid for the new context generation.
		disposeGpuResources();
		if (animationFrame) cancelAnimationFrame(animationFrame);
		animationFrame = 0;
		options.onError("WebGL context lost. Restoring renderer...");
	};

	const handleContextRestored = () => {
		contextLost = false;
		options.onError(null);
		options.onContextRestored();
	};

	const invalidateSize = () => {
		sizeDirty = true;
		requestRender();
	};
	const resizeObserver = new ResizeObserver(invalidateSize);
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

	const completeCompilation = () => {
		if (disposed || contextLost || !pendingPrograms) return;
		try {
			const programs = pendingPrograms.finish();
			if (!programs) {
				compilationTimer = setTimeout(completeCompilation, 4);
				return;
			}
			pendingPrograms = undefined;
			try {
				fallbackPasses = {
					a: initializePass(gl, "Buffer A", programs[0]),
					image: initializePass(gl, "Image", programs[1]),
					ascii: initializePass(gl, "ASCII", programs[2]),
				};
			} catch (error) {
				for (const program of programs) gl.deleteProgram(program);
				throw error;
			}
			initTimeMs = performance.now() - setupStart;
			updateCameraReadout(performance.now(), true);
			requestRender();
		} catch (error) {
			options.onError(formatError(error));
			disposed = true;
			disposeGpuResources();
		}
	};
	completeCompilation();

	let cleaned = false;
	return () => {
		if (cleaned) return;
		cleaned = true;
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
		disposeGpuResources();
		state.requestRender = () => {};
		state.resetFrame = () => {};
		state.cameraEditor = {
			applyPosition: () => false,
			applyForward: () => false,
			applyUniverse: () => false,
			sync: () => {},
		};
		delete window.__blackHoleStats;
	};
}

/** Mutable renderer data. Neither UI framework nor editor DOM participates in ownership. */
export function createRuntimeState(props: Props): RuntimeState {
	const initialProps = {
		...props,
		textSize:
			props.textSize ?? props.asciiCellSize?.y ?? DEFAULT_ASCII_CELL_SIZE.y,
	};
	const controls = createInitialControls(initialProps);
	return {
		initialProps,
		controls,
		atlasConfig: createGlyphAtlasConfig(controls),
		runtimeSnapshot: {},
		animationMode: props.animationMode ?? "off",
		animationAutoplay: props.animationAutoplay ?? true,
		animationPlaying:
			(props.animationAutoplay ?? true) &&
			(props.animationMode ?? "off") !== "off",
		animationRoute: props.animationRoute ?? "/",
		reactRenderCount: 0,
		requestRender() {},
		resetFrame() {},
		cameraEditor: {
			applyPosition: () => false,
			applyForward: () => false,
			applyUniverse: () => false,
			sync() {},
		},
		animationEditor: {
			play() {},
			pause() {},
			restartIntro() {},
			previewIdle() {},
			setRoute() {},
			currentKeyframe: () => "",
			routeConfig: () => "",
		},
	};
}

export function runtimeOptions(
	props: Props,
	onError: RuntimeOptions["onError"],
): RuntimeOptions {
	return {
		renderSettings: createRenderSettingsFromQuality({
			quality: "cinematic-ascii",
			resolutionScale: 1,
			...props,
		}),
		asciiMix: props.asciiMix ?? 1,
		showControls: props.showControls ?? true,
		interactive: props.interactive ?? true,
		debugStats: props.debugStats ?? false,
		rendererModeState: props.rendererMode ?? "auto",
		backendState: props.backend ?? "auto",
		animationMode: props.animationMode ?? "off",
		onError,
		onContextRestored() {},
		onBackend() {},
	};
}

/** Owns one session at a time, including restoration and cancellation. */
export function mountBlackHoleRuntime(
	canvas: HTMLCanvasElement,
	state: RuntimeState,
	initialOptions: RuntimeOptions,
) {
	let resolveReady: (ready: boolean) => void = () => {};
	const ready = new Promise<boolean>((resolve) => {
		resolveReady = resolve;
	});
	let options = initialOptions;
	let disposed = false;
	let cleanup: (() => void) | undefined;
	let generation = 0;
	const start = () => {
		if (disposed) return;
		const currentGeneration = ++generation;
		cleanup?.();
		cleanup = undefined;
		const mount = () => {
			if (disposed || generation !== currentGeneration) return;
			try {
				cleanup = startBlackHoleSession(canvas, state, {
					...options,
					onReady: () => {
						resolveReady(true);
						options.onReady?.();
					},
					onError: (error) => {
						if (error) resolveReady(false);
						options.onError(error);
					},
					onContextRestored: start,
				});
			} catch (error) {
				resolveReady(false);
				options.onError(formatError(error));
			}
		};
		const font = `${state.atlasConfig.textSize}px "${state.atlasConfig.fontFamily}"`;
		if (document.fonts.check(font)) mount();
		else {
			// A smaller public entrypoint can beat the font download. Do not bake
			// fallback glyphs into the atlas; ignore completion after route disposal.
			void document.fonts.load(font).then(mount, mount);
		}
	};
	start();
	return {
		ready,
		updateSettings(next: Partial<RuntimeOptions>) {
			if (!disposed) {
				options = { ...options, ...next };
				start();
			}
		},
		updateControls(next: Partial<ShaderControls>) {
			if (!disposed) {
				Object.assign(state.controls, next);
				state.atlasConfig = createGlyphAtlasConfig(state.controls);
				state.requestRender();
			}
		},
		updateRoute(route: string, resetHistory = false) {
			if (!disposed) {
				state.animationRoute = route;
				if (resetHistory) state.resetFrame();
				state.requestRender();
			}
		},
		get camera() {
			return state.cameraEditor;
		},
		get animation() {
			return state.animationEditor;
		},
		snapshot() {
			return structuredClone(state.runtimeSnapshot);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			resolveReady(false);
			cleanup?.();
			cleanup = undefined;
		},
	};
}
