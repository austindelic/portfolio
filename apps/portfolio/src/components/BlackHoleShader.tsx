import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
	type BlackHoleAnimationRouteKey,
	normalizeBlackHoleAnimationRoute,
} from "../config/black-hole-animation";
import {
	type AnimationEditorApi,
	type BenchmarkResult,
	type CameraEditorApi,
	cameraDefaultsKey,
	createGlyphAtlasConfig,
	createInitialControls,
	createPresetRenderSettings,
	createRenderSettingsFromQuality,
	DEFAULT_ASCII_CELL_SIZE,
	formatCameraNumber,
	formatCameraVec3,
	formatError,
	type Props,
	type QualityPreset,
	type RendererMode,
	type RenderSettings,
	type RuntimeSnapshot,
	type ShaderBackend,
	type ShaderControls,
} from "./BlackHoleCore";
import { mountBlackHoleRuntime, type RuntimeState } from "./BlackHoleRuntime";

export * from "./BlackHoleCore";

function useBlackHoleController({
	className = "",
	showControls = true,
	interactive = true,
	rendererMode = "auto",
	backend = "auto",
	quality = "cinematic-ascii",
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
	const canvasRef = useRef<HTMLDivElement>(null);
	const reactRenderCountRef = useRef(0);
	const requestRenderRef = useRef<() => void>(() => {});
	const resetFrameRef = useRef<() => void>(() => {});
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

	const benchmarkAbortRef = useRef<AbortController | null>(null);
	useEffect(() => () => benchmarkAbortRef.current?.abort(), []);
	const runBenchmark = async () => {
		if (benchmarkRunning) return;
		setBenchmarkRunning(true);
		const abort = new AbortController();
		benchmarkAbortRef.current = abort;
		try {
			const benchmark = await import("./BlackHoleBenchmark");
			if (abort.signal.aborted) return;
			await benchmark.runBenchmark({
				signal: abort.signal,
				rendererModeRef,
				backendRef,
				setRendererModeState,
				setBackendState,
				setBenchmarkResults,
				requestRenderRef,
			});
		} catch (error) {
			if (!abort.signal.aborted) setError(formatError(error));
		} finally {
			if (!abort.signal.aborted) setBenchmarkRunning(false);
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

	initialPropsRef.current.initialCameraPosition = initialCameraPosition;
	initialPropsRef.current.initialCameraForward = initialCameraForward;
	initialPropsRef.current.initialUniverseSign = initialUniverseSign;

	useEffect(() => {
		void contextRestoreToken;

		const initialCameraChanged =
			initialCameraKeyRef.current !== initialCameraKey;
		initialCameraKeyRef.current = initialCameraKey;

		if (initialCameraChanged) {
			runtimeSnapshotRef.current = {
				shaderTime: runtimeSnapshotRef.current.shaderTime,
				movementSpeed: runtimeSnapshotRef.current.movementSpeed,
			};
		}

		const host = canvasRef.current;
		if (!host) return;
		const canvas = document.createElement("canvas");
		canvas.className = `block h-full w-full bg-black ${interactive ? "cursor-crosshair touch-none" : "pointer-events-none"}`;
		canvas.setAttribute("aria-label", "Interactive black hole shader");
		host.replaceChildren(canvas);

		const state: RuntimeState = {
			get animationAutoplay() {
				return animationAutoplayRef.current;
			},
			set animationAutoplay(value) {
				animationAutoplayRef.current = value;
			},
			get animationEditor() {
				return animationEditorRef.current;
			},
			set animationEditor(value) {
				animationEditorRef.current = value;
			},
			get animationMode() {
				return animationModeRef.current;
			},
			set animationMode(value) {
				animationModeRef.current = value;
			},
			get animationPlaying() {
				return animationPlayingRef.current;
			},
			set animationPlaying(value) {
				animationPlayingRef.current = value;
			},
			get animationRoute() {
				return animationRouteRef.current;
			},
			set animationRoute(value) {
				animationRouteRef.current = value;
			},
			get atlasConfig() {
				return atlasConfigRef.current;
			},
			set atlasConfig(value) {
				atlasConfigRef.current = value;
			},
			get cameraEditor() {
				return cameraEditorRef.current;
			},
			set cameraEditor(value) {
				cameraEditorRef.current = value;
			},
			get controls() {
				return controlsRef.current;
			},
			set controls(value) {
				controlsRef.current = value;
			},
			get initialProps() {
				return initialPropsRef.current;
			},
			set initialProps(value) {
				initialPropsRef.current = value;
			},
			get reactRenderCount() {
				return reactRenderCountRef.current;
			},
			set reactRenderCount(value) {
				reactRenderCountRef.current = value;
			},
			get requestRender() {
				return requestRenderRef.current;
			},
			set requestRender(value) {
				requestRenderRef.current = value;
			},
			get resetFrame() {
				return resetFrameRef.current;
			},
			set resetFrame(value) {
				resetFrameRef.current = value;
			},
			get runtimeSnapshot() {
				return runtimeSnapshotRef.current;
			},
			set runtimeSnapshot(value) {
				runtimeSnapshotRef.current = value;
			},
		};
		const runtime = mountBlackHoleRuntime(canvas, state, {
			renderSettings,
			asciiMix,
			showControls,
			interactive,
			debugStats,
			rendererModeState,
			backendState,
			animationMode,
			onError: setError,
			onContextRestored: () => setContextRestoreToken((token) => token + 1),
			onBackend: setBackendState,
			onAnimationStatus: setAnimationEditorStatus,
			onAnimationPlaying: setAnimationPlayingState,
			onCameraReadout(camera, force) {
				const active = document.activeElement;
				for (const [input, value] of [
					[cameraPositionInputRef.current, formatCameraVec3(camera.position)],
					[cameraForwardInputRef.current, formatCameraVec3(camera.forward)],
					[
						cameraUniverseInputRef.current,
						formatCameraNumber(camera.universeSign),
					],
				] as const) {
					if (input && (force || active !== input)) input.value = value;
				}
			},
		});
		return () => runtime.dispose();
	}, [
		renderSettings,
		asciiMix,
		showControls,
		interactive,
		debugStats,
		rendererModeState,
		backendState,
		initialCameraKey,
		contextRestoreToken,
		animationMode,
	]);

	// Astro supplies fresh camera arrays when updating persisted island props.
	// Preserve the previous time/history reset without recompiling or reallocating.
	useEffect(() => {
		void initialCameraPosition;
		void initialCameraForward;
		void initialUniverseSign;
		resetFrameRef.current();
	}, [initialCameraPosition, initialCameraForward, initialUniverseSign]);

	return {
		controls,
		renderSettings,
		rendererModeState,
		backendState,
		updateControl,
		updateRenderSetting,
		applyQualityPreset,
		updateRendererMode,
		updateBackend,
		updateAsciiEnabled,
		animationMode,
		animationEditorStatus,
		animationEditorRoute,
		setAnimationEditorRoute,
		animationPlaying,
		animationEditorRef,
		copyAnimationText,
		cameraPositionInputRef,
		cameraForwardInputRef,
		cameraUniverseInputRef,
		applyCameraPositionInput,
		applyCameraForwardInput,
		applyCameraUniverseInput,
		handleCameraInputKeyDown,
		blackHolePanelOpen,
		setBlackHolePanelOpen,
		asciiPanelOpen,
		setAsciiPanelOpen,
		benchmarkPanelOpen,
		setBenchmarkPanelOpen,
		benchmarkRunning,
		benchmarkResults,
		runBenchmark,
		className,
		interactive,
		showControls,
		canvasRef,
		contextRestoreToken,
		error,
	};
}

export type BlackHoleController = ReturnType<typeof useBlackHoleController>;

const BlackHoleControls = lazy(() => import("./BlackHoleControls"));

export default function BlackHoleShader(props: Props) {
	const controller = useBlackHoleController(props);
	const {
		className,
		interactive,
		showControls,
		canvasRef,
		contextRestoreToken,
		error,
		rendererModeState,
		backendState,
	} = controller;

	return (
		<div className={`relative h-full w-full bg-black ${className}`}>
			<div
				key={`${rendererModeState}:${backendState}:${contextRestoreToken}`}
				ref={canvasRef}
				className={`block h-full w-full bg-black ${
					interactive ? "cursor-crosshair touch-none" : "pointer-events-none"
				}`}
			/>
			{showControls ? (
				<Suspense fallback={null}>
					<BlackHoleControls controller={controller} />
				</Suspense>
			) : null}
			{error ? (
				<div className="absolute inset-x-4 bottom-4 border border-red-500/60 bg-black/85 p-3 font-mono text-xs text-red-200">
					{error}
				</div>
			) : null}
		</div>
	);
}
