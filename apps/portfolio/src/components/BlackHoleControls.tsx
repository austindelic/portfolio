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
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BLACK_HOLE_ANIMATION_ROUTE_OPTIONS } from "../config/black-hole-animation";
import {
	type BlackHoleController,
	FONT_OPTIONS,
	type GlyphPreset,
	MIN_DPR,
	MIN_QUALITY_VALUE,
	MIN_RENDER_SCALE,
	MIN_TEXT_SIZE,
	type QualityPreset,
	type RendererMode,
	type ShaderBackend,
} from "./BlackHoleShader";

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
				{!options.some((option) => option.value === value) && (
					<option value={value} disabled hidden>
						Custom
					</option>
				)}
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

export default function BlackHoleControls({
	controller,
}: {
	controller: BlackHoleController;
}) {
	const {
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
	} = controller;

	const glyphPresetOptions: Array<{ label: string; value: GlyphPreset }> = [
		{ label: "Gargantua", value: "gargantua" },
		{ label: "Classic", value: "classic" },
		{ label: "Dense", value: "dense" },
		{ label: "Custom", value: "custom" },
	];
	const qualityPresetOptions: Array<{ label: string; value: QualityPreset }> = [
		{ label: "Balanced", value: "balanced" },
		{ label: "Cinematic ASCII", value: "cinematic-ascii" },
		{ label: "Mobile", value: "mobile-safe" },
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
								onChange={(value) => updateRenderSetting("qualityValue", value)}
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
								onChange={(value) => updateRenderSetting("sceneScale", value)}
							/>
							<NumberControl
								label="Prepass"
								value={renderSettings.prepassScale}
								min={MIN_RENDER_SCALE}
								step={0.01}
								onChange={(value) => updateRenderSetting("prepassScale", value)}
							/>
							<NumberControl
								label="Bloom Res"
								value={renderSettings.bloomScale}
								min={MIN_RENDER_SCALE}
								step={0.01}
								onChange={(value) => updateRenderSetting("bloomScale", value)}
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
								onChange={(value) => updateRenderSetting("cellWidth", value)}
							/>
							<NumberControl
								label="Cell H"
								value={renderSettings.cellHeight}
								min={2}
								step={1}
								onChange={(value) => updateRenderSetting("cellHeight", value)}
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
										<p className="text-red-200/70">{result.fallbackReason}</p>
									) : null}
								</div>
							))
						)}
					</div>
				</ControlPanel>
			</div>
		</div>
	);
}
