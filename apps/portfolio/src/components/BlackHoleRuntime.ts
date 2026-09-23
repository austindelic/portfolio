import {
	BLACK_HOLE_ANIMATION_ROUTES,
	type BlackHoleAnimationKeyframe,
	type BlackHoleAnimationRouteKey,
	getBlackHoleRouteAnimation,
	normalizeBlackHoleAnimationRoute,
} from "../config/black-hole-animation";
import { asciiSampleSide, asciiSourceDimension } from "../lib/ascii-analysis";
import type { BackendFrame, BlackHoleBackend } from "./BlackHoleBackend";
import { RenderTargetAllocationError } from "./BlackHoleBackend";
import {
	type AnimationEditorApi,
	type AnimationMode,
	type AnimationPhase,
	animationKeyframeFromCamera,
	applyAnimationCamera,
	type BlackHoleStats,
	type CameraEditorApi,
	type CameraState,
	CONTROL_KEY_CODES,
	cloneVec3,
	copyVec3Into,
	createGlyphAtlasConfig,
	createInitialCamera,
	createInitialControls,
	createRenderSettingsFromQuality,
	createRenderUniforms,
	DEFAULT_ASCII_CELL_SIZE,
	DIRECT_FALLBACK_DPR,
	detectRuntimeProfile,
	estimateTextureMemoryBytes,
	evaluateAnimationSequenceInto,
	formatError,
	type GlyphAtlasConfig,
	glyphControlsKey,
	isControlKeyboardTarget,
	isWebGpuAvailable,
	length,
	MOUSE_SENSITIVITY,
	MOVE_SPEED,
	MOVE_SPEED_FACTOR,
	type Props,
	parseCameraVec3,
	parseUniverseSign,
	type RendererMode,
	type RenderSettings,
	type RuntimeSnapshot,
	resolveRendererMode,
	resolveRenderSettings,
	resolveShaderBackend,
	type ShaderBackend,
	type ShaderControls,
	setCameraForward,
	stringifyAnimationValue,
	TARGET_ALLOCATION_SCALE_STEPS,
	updateCamera,
	writeAnimationControlsFromFrame,
	writeRenderUniforms,
} from "./BlackHoleCore";
import {
	BlackHoleOrbitController,
	createOrbitFrame,
	frameIntroSequence,
	motionFromFrame,
	varyOrbit,
} from "./BlackHoleOrbit";

export type RuntimeState = {
	resumeAnimation?: {
		phase: AnimationPhase;
		sequence: BlackHoleAnimationKeyframe[];
		time: number;
		loops: boolean;
		index: number;
		route: BlackHoleAnimationRouteKey;
		playing: boolean;
	};
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
	onCanvasReplaced?: (canvas: HTMLCanvasElement) => void;
	onRenderFailure?: (error: unknown) => void;
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
	const abort = new AbortController();
	const setupStart = performance.now();
	let attempt: AbortController | undefined;
	let cleanup: (() => void) | undefined;
	let owned: BlackHoleBackend | undefined;
	let fallingBack = false;
	let generation = 0;
	const selected = resolveShaderBackend(
		options.backendState,
		resolveRendererMode(options.rendererModeState),
	);
	const initialize = async (
		kind: "webgpu" | "webgl2",
		reason: string | null,
	) => {
		const current = ++generation;
		const controller = new AbortController();
		attempt = controller;
		const fail = (error: unknown) => {
			if (abort.signal.aborted || current !== generation) return;
			controller.abort();
			cleanup?.();
			cleanup = undefined;
			owned?.dispose();
			owned = undefined;
			if (selected === "webgpu" && !fallingBack) {
				fallingBack = true;
				const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
				canvas.replaceWith(fresh);
				canvas = fresh;
				options.onCanvasReplaced?.(fresh);
				void initialize("webgl2", formatError(error));
			} else options.onError(formatError(error));
		};
		try {
			const factory =
				kind === "webgpu"
					? (await import("./BlackHoleWebGpuBackend")).createWebGpuBackend
					: (await import("./BlackHoleWebGlBackend")).createWebGlBackend;
			controller.signal.throwIfAborted();
			const backend = await factory({
				canvas,
				cellGrid: options.rendererModeState === "ascii-cell",
				settings: resolveRenderSettings(options.renderSettings),
				atlas: state.atlasConfig,
				initialBloomStrength: state.controls.bloomStrength,
				signal: controller.signal,
				onFailure: fail,
				onInvalidate: () => state.requestRender(),
				profiling: options.debugStats || options.showControls,
			});
			if (abort.signal.aborted || current !== generation) {
				backend.dispose();
				return;
			}
			owned = backend;
			cleanup = startRendererSession(
				canvas,
				state,
				{ ...options, onRenderFailure: fail },
				backend,
				reason,
				setupStart,
			);
			options.onError(null);
		} catch (error) {
			fail(error);
		}
	};
	void initialize(selected, null);
	return () => {
		abort.abort();
		attempt?.abort();
		cleanup?.();
		owned?.dispose();
	};
}

function startRendererSession(
	canvas: HTMLCanvasElement,
	state: RuntimeState,
	options: RuntimeOptions,
	backend: BlackHoleBackend,
	fallbackReason: string | null,
	setupStart: number,
) {
	const {
		renderSettings,
		asciiMix,
		showControls,
		interactive,
		debugStats,
		rendererModeState,
		backendState,
	} = options;

	const settings = resolveRenderSettings(renderSettings);
	const runtimeProfile = detectRuntimeProfile();
	const resolvedRendererMode = resolveRendererMode(rendererModeState);

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
	let orbitSeed = Math.random();
	try {
		const saved = sessionStorage.getItem("black-hole-orbit-seed");
		if (saved !== null && Number.isFinite(Number(saved)))
			orbitSeed = Number(saved);
		else sessionStorage.setItem("black-hole-orbit-seed", String(orbitSeed));
	} catch {
		/* Storage can be unavailable in privacy mode. */
	}
	const initialAnimationRoute = currentAnimationRoute();
	const freshRouteEntry =
		!fallbackReason &&
		activeAnimationMode() === "route" &&
		!persistedAnimationSnapshot &&
		!state.runtimeSnapshot.cameraPosition;
	let routeIntroPending =
		freshRouteEntry &&
		initialAnimationRoute === "/" &&
		activeAnimationAutoplay() &&
		!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const routeIntroStartFrame = freshRouteEntry
		? routeIntroPending
			? getBlackHoleRouteAnimation("/").intro[0]
			: createOrbitFrame(
					varyOrbit(
						getBlackHoleRouteAnimation(initialAnimationRoute).orbit,
						orbitSeed,
					),
					Math.max(0.2, canvas.clientWidth / Math.max(1, canvas.clientHeight)),
				)
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
	const mode =
		resolvedRendererMode === "ascii-cell"
			? "ascii-cell"
			: backend.kind === "webgpu"
				? "webgpu"
				: "fallback";
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

	let pointerActive = false;
	let lastPointerX = 0;
	let lastPointerY = 0;
	let lastCameraReadoutUpdate = 0;
	let movementSpeed =
		state.runtimeSnapshot.movementSpeed ??
		persistedAnimationSnapshot?.movementSpeed ??
		MOVE_SPEED;
	const maxTextureSize = backend.maxTextureSize;

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

	let glyphAtlasConfig = state.atlasConfig;
	let liveGlyphControlsKey = glyphControlsKey(state.controls);
	let contextLost = false;
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

	const syncGlyphAtlasConfig = (nextConfig: GlyphAtlasConfig) => {
		if (nextConfig.key === glyphAtlasConfig.key) return;
		backend.setGlyphAtlas(nextConfig);
		glyphAtlasConfig = nextConfig;
	};
	const resume = fallbackReason ? state.resumeAnimation : undefined;
	let animationPhase: AnimationPhase = resume?.phase ?? "off";
	let animationSequence: BlackHoleAnimationKeyframe[] = resume?.sequence ?? [];
	let animationSequenceTime = resume?.time ?? 0;
	let animationSequenceLoops = resume?.loops ?? false;
	let animationFrameIndex = resume?.index ?? 0;
	let animationSequenceJustStarted = false;
	let introAspect = Number.NaN;
	if (resume) {
		activeAnimationRoute = resume.route;
		state.animationPlaying = resume.playing;
	}
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
		introAspect = Number.NaN;
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

	let orbitController: BlackHoleOrbitController | null = null;
	const viewportAspect = () =>
		Math.max(0.2, canvas.clientWidth / Math.max(1, canvas.clientHeight));
	// Sample the existing keyframe evaluator only when an intro is interrupted.
	// The spherical controller inherits the displayed pose and its derivatives.
	const inheritIntroMotion = (controller: BlackHoleOrbitController) => {
		const sample = (time: number) => {
			const frame = currentAnimationKeyframe();
			const result = {
				frame: null as BlackHoleAnimationKeyframe | null,
				frameIndex: 0,
				done: false,
				sequenceTime: 0,
			};
			evaluateAnimationSequenceInto(result, frame, {
				sequence: animationSequence,
				time,
				loop: false,
				baseControls: state.controls,
				baseAsciiEnabled: settings.asciiEnabled,
			});
			return motionFromFrame(result.frame ?? frame);
		};
		const h = 0.001,
			before = sample(Math.max(0, animationSequenceTime - h)),
			after = sample(animationSequenceTime + h);
		for (let i = 0; i < 5; i++) {
			const center = controller.motion.pose[i];
			const unwrap = (value: number) =>
				i === 1 || i === 3
					? center +
						Math.atan2(Math.sin(value - center), Math.cos(value - center))
					: value;
			const a = unwrap(before.pose[i]),
				b = unwrap(after.pose[i]);
			controller.motion.velocity[i] = (b - a) / (2 * h);
			controller.motion.acceleration[i] = (b - 2 * center + a) / (h * h);
		}
	};
	const syncOrbitRoute = () => {
		const route = currentAnimationRoute();
		if (routeIntroPending) {
			routeIntroPending = false;
			if (route === "/" && !reducedMotion.matches) {
				startIntro("/", true);
				return;
			}
		}
		const inIntro = animationPhase === "intro" && !orbitController;
		if (inIntro && route === activeAnimationRoute && !reducedMotion.matches)
			return;
		if (orbitController && route === activeAnimationRoute) return;
		const config = getBlackHoleRouteAnimation(route),
			orbit = varyOrbit(config.orbit, orbitSeed);
		if (!orbitController) {
			orbitController = new BlackHoleOrbitController(
				currentAnimationKeyframe(),
				orbit,
				viewportAspect(),
			);
			if (inIntro) inheritIntroMotion(orbitController);
			if (inIntro || persistedAnimationSnapshot)
				orbitController.join(orbit, viewportAspect());
		} else orbitController.join(orbit, viewportAspect());
		activeAnimationRoute = route;
		animationPhase = orbitController.transitioning ? "transition" : "idle";
		setAnimationPlaying(activeAnimationAutoplay());
		const visual = config.intro.at(-1);
		writeAnimationControlsFromFrame(
			lastAnimatedControls,
			state.controls,
			visual ?? null,
		);
		lastAnimatedAsciiEnabled = visual?.asciiEnabled ?? settings.asciiEnabled;
	};

	const syncAnimationRoute = () => {
		if (!animationIsEnabled()) return;
		if (activeAnimationMode() === "route") {
			syncOrbitRoute();
			return;
		}
		const nextRoute = currentAnimationRoute();
		if (activeAnimationMode() === "editor") {
			if (nextRoute !== activeAnimationRoute && animationPhase !== "off") {
				startIntro(nextRoute, state.animationPlaying);
			}
			return;
		}
	};

	const finishAnimationPhase = () => {
		if (activeAnimationMode() === "route" && animationPhase === "intro") {
			const orbit = varyOrbit(
				getBlackHoleRouteAnimation(activeAnimationRoute).orbit,
				orbitSeed,
			);
			orbitController = new BlackHoleOrbitController(
				currentAnimationKeyframe(),
				orbit,
				viewportAspect(),
			);
			orbitController.join(orbit, viewportAspect(), 2);
			animationPhase = "idle";
			return;
		}
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

		if (activeAnimationMode() === "route" && animationPhase === "intro") {
			const aspect = viewportAspect();
			if (aspect !== introAspect) {
				const config = getBlackHoleRouteAnimation(activeAnimationRoute);
				animationSequence = frameIntroSequence(
					config.intro,
					config.orbit,
					aspect,
				);
				introAspect = aspect;
			}
		}
		syncAnimationRoute();

		if (activeAnimationMode() === "route" && orbitController) {
			orbitController.update(
				state.animationPlaying ? delta : 0,
				viewportAspect(),
				reducedMotion.matches,
				scratchAnimationFrame,
			);
			scratchAnimationFrame.universeSign = camera.universeSign;
			applyAnimationCamera(camera, scratchAnimationFrame);
			animationPhase = orbitController.transitioning ? "transition" : "idle";
			return {
				controls: lastAnimatedControls,
				asciiEnabled: lastAnimatedAsciiEnabled,
				active: true,
			};
		}

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
			}
		}

		throw lastError instanceof Error
			? lastError
			: new Error("Could not allocate render targets.");
	};

	const sourceDimension = (dimension: number, cell: number) =>
		resolvedRendererMode === "ascii-cell"
			? Math.min(
					dimension,
					Math.ceil(dimension / Math.max(2, cell)) *
						asciiSampleSide(settings.qualityValue),
				)
			: asciiSourceDimension(
					dimension,
					Math.min(state.atlasConfig.cellSize.x, state.atlasConfig.cellSize.y),
					settings.qualityValue,
					settings.sceneScale,
				);
	const createFallbackTargets = () => {
		sceneWidth = allocatedTargetDimension(
			sourceDimension(renderWidth, settings.cellWidth),
		);
		sceneHeight = allocatedTargetDimension(
			sourceDimension(renderHeight, settings.cellHeight),
		);
		prepassWidth = sceneWidth;
		prepassHeight = sceneHeight;
		bloomWidth = sceneWidth;
		bloomHeight = sceneHeight;
		backend.resize(renderWidth, renderHeight, sceneWidth, sceneHeight);
	};

	let lastRenderNow = 0;
	let sizeDirty = true;
	let measuredDpr = 0;
	const resize = () => {
		const deviceDpr = window.devicePixelRatio || 1;
		if (!sizeDirty && measuredDpr === deviceDpr) return;
		sizeDirty = false;
		measuredDpr = deviceDpr;
		const rect = canvas.getBoundingClientRect();
		const dprCap =
			resolvedRendererMode === "ascii-cell"
				? settings.maxDevicePixelRatio
				: Math.min(settings.maxDevicePixelRatio, DIRECT_FALLBACK_DPR);
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
			sourceDimension(nextWidth, settings.cellWidth),
		);
		const nextSceneHeight = allocatedTargetDimension(
			sourceDimension(nextHeight, settings.cellHeight),
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

		createTargetsWithRetry(createFallbackTargets);

		frame = 0;
		startTime = performance.now();
		lastTime = startTime;
		// Reallocate render history without restarting the visible shader clock.
	};

	const publishStats = (frameTimeMs: number, now: number) => {
		if (!debugStats && !import.meta.env.DEV && !showControls) return;
		if (!showControls && now - lastStatsPublish < 250) return;
		lastStatsPublish = now;

		const activeControls = lastAnimatedControls;
		const activeAtlas = glyphAtlasConfig;
		const stats: BlackHoleStats = {
			mode,
			backend: backend.kind,
			requestedBackend: backendState,
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
					backend.bytesPerPixel,
					3 + 3 * Number(backend.bloomAllocated),
				),
			initTimeMs,
			gpuFrameTimeMs: backend.gpuFrameTimeMs,
			gpuTimingSupported: backend.gpuTimingSupported,
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

	const backendFrame: BackendFrame = {
		time: 0,
		delta: 0,
		frame: 0,
		mouse,
		keyboard: keyboardData,
		camera,
		uniforms: activeRenderUniforms,
		asciiEnabled: settings.asciiEnabled,
	};
	const renderFrame = (now: number) => {
		if (disposed) return;

		const cpuFrameStart = performance.now();
		animationFrame = 0;
		if (
			resolvedRendererMode === "ascii-cell" &&
			frame > 0 &&
			now - lastRenderNow < settings.frameIntervalMs
		) {
			animationFrame = requestAnimationFrame(renderFrame);
			return;
		}
		lastRenderNow = now;

		try {
			if (resetFrameRequested) {
				frame = 0;
				shaderTime = 0;
				lastTime = now;
				resetFrameRequested = false;
			}
			resize();

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
			if (resolvedRendererMode === "ascii-cell") {
				activeRenderUniforms.asciiCellSize.x = settings.cellWidth;
				activeRenderUniforms.asciiCellSize.y = settings.cellHeight;
			}
			const shaderDelta = delta * liveControls.timeScale;
			lastTime = now;
			shaderTime += shaderDelta;

			if (!animationFrameState.active) {
				updateCamera(camera, keyboardData, delta, movementSpeed);
			}
			snapshotRuntime(reducedMotion.matches, now);

			backendFrame.time = shaderTime;
			backendFrame.delta = shaderDelta;
			backendFrame.frame = frame;
			backendFrame.asciiEnabled = activeAsciiEnabled;
			let submitted: boolean | undefined;
			try {
				submitted = backend.render(backendFrame);
			} catch (error) {
				if (!(error instanceof RenderTargetAllocationError)) throw error;
				lastAllocationFailure = formatError(error);
				createTargetsWithRetry(() => {
					createFallbackTargets();
					submitted = backend.render(backendFrame);
				});
			}

			const frameTimeMs = performance.now() - cpuFrameStart;
			cpuAverageFrameTimeMs = cpuAverageFrameTimeMs * 0.94 + frameTimeMs * 0.06;
			averageFrameTimeMs = averageFrameTimeMs * 0.94 + delta * 1000 * 0.06;
			publishStats(frameTimeMs, now);
			updateCameraReadout(now);

			if (submitted !== false) {
				if (frame === 0) options.onReady?.();
				frame += 1;
			}
		} catch (renderError) {
			options.onRenderFailure?.(renderError);
			disposed = true;
			disposeGpuResources();
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

	const handleMotionPreferenceChange = () => {
		lastTime = performance.now();
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
		backend.dispose();
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
	reducedMotion.addEventListener("change", handleMotionPreferenceChange);
	canvas.addEventListener("webglcontextlost", handleContextLost);
	canvas.addEventListener("webglcontextrestored", handleContextRestored);

	initTimeMs = performance.now() - setupStart;
	updateCameraReadout(performance.now(), true);
	requestRender();

	let cleaned = false;
	return () => {
		if (cleaned) return;
		cleaned = true;
		snapshotRuntime(true);
		state.resumeAnimation = {
			phase: animationPhase,
			sequence: animationSequence,
			time: animationSequenceTime,
			loops: animationSequenceLoops,
			index: animationFrameIndex,
			route: activeAnimationRoute,
			playing: state.animationPlaying,
		};
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
		reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
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
		const hadSession = Boolean(cleanup);
		cleanup?.();
		if (hadSession && canvas.parentNode) {
			const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
			canvas.replaceWith(fresh);
			canvas = fresh;
			options.onCanvasReplaced?.(fresh);
		}
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
					onCanvasReplaced: (next) => {
						canvas = next;
						options.onCanvasReplaced?.(next);
					},
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
