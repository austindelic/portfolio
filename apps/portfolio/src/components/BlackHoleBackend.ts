import type {
	CameraState,
	GlyphAtlasConfig,
	RenderSettings,
	RenderUniforms,
	ResolvedShaderBackend,
} from "./BlackHoleCore";

export type BackendFrame = {
	time: number;
	delta: number;
	frame: number;
	mouse: Float32Array;
	keyboard: Uint8Array;
	camera: CameraState;
	uniforms: RenderUniforms;
	asciiEnabled: boolean;
};

/** GPU resources only; the runtime owns all input, animation and scheduling. */
export type BlackHoleBackend = {
	kind: ResolvedShaderBackend;
	maxTextureSize: number;
	bytesPerPixel: number;
	bloomAllocated: boolean;
	gpuFrameTimeMs: number | null;
	gpuTimingSupported: boolean;
	resize(
		width: number,
		height: number,
		sceneWidth: number,
		sceneHeight: number,
	): void;
	setGlyphAtlas(config: GlyphAtlasConfig): void;
	render(frame: BackendFrame): boolean | undefined;
	dispose(): void;
};

export type BackendOptions = {
	canvas: HTMLCanvasElement;
	cellGrid: boolean;
	initialBloomStrength: number;
	settings: RenderSettings;
	atlas: GlyphAtlasConfig;
	signal: AbortSignal;
	onFailure(error: unknown): void;
	onInvalidate(): void;
	profiling: boolean;
};

export class RenderTargetAllocationError extends Error {
	constructor(cause: unknown) {
		super(String(cause), { cause });
		this.name = "RenderTargetAllocationError";
	}
}
