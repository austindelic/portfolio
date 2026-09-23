import {
	type BenchmarkResult,
	type BlackHoleStats,
	isWebGpuAvailable,
	type RendererMode,
	type ShaderBackend,
} from "./BlackHoleCore";

type BenchmarkOptions = {
	signal: AbortSignal;
	rendererModeRef: { current: RendererMode };
	backendRef: { current: ShaderBackend };
	setRendererModeState: (mode: RendererMode) => void;
	setBackendState: (backend: ShaderBackend) => void;
	setBenchmarkResults: (results: BenchmarkResult[]) => void;
	requestRenderRef: { current: () => void };
};
function benchmarkP95(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
	return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
}

export async function runBenchmark({
	signal,
	rendererModeRef,
	backendRef,
	setRendererModeState,
	setBackendState,
	setBenchmarkResults,
	requestRenderRef,
}: BenchmarkOptions) {
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
		new Promise<void>((resolve, reject) => {
			if (signal.aborted) {
				reject(signal.reason);
				return;
			}
			const onAbort = () => {
				window.clearTimeout(timer);
				reject(signal.reason);
			};
			const timer = window.setTimeout(() => {
				signal.removeEventListener("abort", onAbort);
				resolve();
			}, ms);
			signal.addEventListener("abort", onAbort, { once: true });
		});
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
			const readStats = (): BlackHoleStats | undefined =>
				window.__blackHoleStats;
			let lastFrame = readStats()?.frame ?? -1;
			let lastFrameSampleTime = performance.now();
			let framesSeen = 0;
			const benchmarkStart = performance.now();

			for (let i = 0; i < 40; i++) {
				await wait(50);
				const sampleTime = performance.now();
				latestStats = readStats();
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
		if (!signal.aborted) {
			setRendererModeState(previousRendererMode);
			setBackendState(previousBackend);
			requestRenderRef.current();
		}
	}
}
