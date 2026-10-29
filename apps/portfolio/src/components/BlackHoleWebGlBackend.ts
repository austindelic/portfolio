import asciiSource from "@repo/black-hole/shaders/ascii.glsl?raw";
import bloomSource from "@repo/black-hole/shaders/bloom.glsl?raw";
import bufferASource from "@repo/black-hole/shaders/buffer-a.glsl?raw";
import bufferBSource from "@repo/black-hole/shaders/buffer-b.glsl?raw";
import bufferCSource from "@repo/black-hole/shaders/buffer-c.glsl?raw";
import bufferDSource from "@repo/black-hole/shaders/buffer-d.glsl?raw";
import cellSource from "@repo/black-hole/shaders/cell.glsl?raw";
import imageSource from "@repo/black-hole/shaders/image.glsl?raw";
import type {
	BackendFrame,
	BackendOptions,
	BlackHoleBackend,
} from "./BlackHoleBackend";
import { RenderTargetAllocationError } from "./BlackHoleBackend";
import { submitPrograms } from "./BlackHoleCompilation";
import type {
	CameraState,
	FallbackPassSet,
	FallbackTargets,
	RenderUniforms,
} from "./BlackHoleCore";
import {
	chooseByteTextureFormat,
	chooseFallbackTextureFormat,
	createBlackHoleFragmentSource,
	createGlyphTextureSet,
	createKeyboardTexture,
	createPass,
	createPingPongTarget,
	createRenderTarget,
	createSolidTexture,
	createStandardFragmentSource,
	disposeProgramPass,
	disposeRenderTarget,
	initializePass,
	renderPass,
	updateKeyboardTexture,
	VERTEX_SOURCE,
} from "./BlackHoleGl";
export async function createWebGlBackend({
	canvas,
	cellGrid,
	settings,
	atlas,
	signal,
}: BackendOptions): Promise<BlackHoleBackend> {
	const gl = canvas.getContext("webgl2", {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: true,
	});
	if (!gl) throw new Error("WebGL2 is not available in this browser.");
	const fallbackFormat = chooseFallbackTextureFormat(gl);
	let fallbackPasses: FallbackPassSet | null = null;
	let fallbackTargets: FallbackTargets | null = null;
	let glyphTextures: ReturnType<typeof createGlyphTextureSet>;
	let fallbackTexture: ReturnType<typeof createSolidTexture>;
	let keyboardTexture: ReturnType<typeof createKeyboardTexture>;
	let vertexBuffer: WebGLBuffer | null = null;
	let renderWidth = 1,
		renderHeight = 1,
		sceneWidth = 1,
		sceneHeight = 1;
	let frame = 0,
		mouse: Float32Array = new Float32Array(4),
		camera: CameraState;
	const channelResolutionScratch = new Float32Array(12);
	const previousKeyboard = new Uint8Array(256 * 4);
	let disposed = false;
	let pending: ReturnType<typeof submitPrograms> | undefined;
	const disposeTargets = () => {
		fallbackTargets?.a.dispose();
		for (const t of [
			fallbackTargets?.b,
			fallbackTargets?.c,
			fallbackTargets?.d,
			fallbackTargets?.scene,
		])
			disposeRenderTarget(gl, t ?? null);
		fallbackTargets = null;
	};
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		pending?.cancel();
		disposeTargets();
		gl.deleteBuffer(vertexBuffer);
		if (fallbackTexture) gl.deleteTexture(fallbackTexture.texture);
		if (keyboardTexture) gl.deleteTexture(keyboardTexture.texture);
		glyphTextures?.dispose();
		for (const pass of Object.values(fallbackPasses ?? {}))
			if (pass) disposeProgramPass(gl, pass);
	};
	signal.addEventListener("abort", dispose, { once: true });
	try {
		signal.throwIfAborted();
		fallbackTexture = createSolidTexture(gl, [0, 0, 0, 255]);
		keyboardTexture = createKeyboardTexture(gl, new Uint8Array(256 * 4));
		glyphTextures = createGlyphTextureSet(gl, atlas);
		vertexBuffer = gl.createBuffer();
		if (!vertexBuffer)
			throw new Error("Could not create fullscreen vertex buffer.");
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 3, -1, -1, 3]),
			gl.STATIC_DRAW,
		);
		pending = submitPrograms(
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
				fragment:
					cellGrid && name === "Buffer A"
						? createBlackHoleFragmentSource(
								"out vec4 shadertoyFragColor;\n" +
									cellSource +
									"\nvoid main(){mainImage(shadertoyFragColor,gl_FragCoord.xy);}",
							)
						: createStandardFragmentSource(name, source),
			})),
		);
		let programs = pending.finish();
		while (!programs) {
			await new Promise((r) => setTimeout(r, 4));
			signal.throwIfAborted();
			programs = pending.finish();
		}
		try {
			fallbackPasses = {
				a: initializePass(gl, "Buffer A", programs[0]),
				image: initializePass(gl, "Image", programs[1]),
				ascii: initializePass(gl, "ASCII", programs[2]),
			};
		} catch (error) {
			for (const p of programs) gl.deleteProgram(p);
			throw error;
		}
		pending = undefined;
	} catch (error) {
		dispose();
		throw error;
	}
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
			} catch (error) {
				throw new RenderTargetAllocationError(error);
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

	const cellDisplayUniforms = {} as RenderUniforms;
	const renderCell = (input: BackendFrame) => {
		if (!fallbackTargets || !fallbackPasses) return;
		const t = fallbackTargets,
			p = fallbackPasses,
			u = input.uniforms;
		const draw = (
			pass: typeof p.a,
			target: typeof t.scene | null,
			channels: (typeof fallbackTexture)[],
			uniforms = u,
			bloomMode = 0,
			canvasSize: { x: number; y: number } | null = null,
		) =>
			renderPass(
				gl,
				pass,
				vertexBuffer,
				target,
				target?.width ?? renderWidth,
				target?.height ?? renderHeight,
				input.time,
				input.delta,
				input.frame,
				input.mouse,
				channels[0] ?? fallbackTexture,
				channels[1] ?? fallbackTexture,
				channels[2] ?? fallbackTexture,
				channels[3] ?? fallbackTexture,
				input.camera,
				settings.qualityValue,
				1,
				bloomMode,
				channelResolutionScratch,
				uniforms,
				canvasSize,
			);
		draw(p.a, t.a.write, [], u, 0, { x: renderWidth, y: renderHeight });
		if (settings.enableBloomPass && u.bloomStrength !== 0) {
			p.b ??= createPass(
				gl,
				"Cell Bloom",
				createStandardFragmentSource("Bloom", bloomSource),
			);
			const bw = Math.max(2, Math.ceil(sceneWidth * settings.bloomScale)),
				bh = Math.max(2, Math.ceil(sceneHeight * settings.bloomScale));
			t.b ??= createRenderTarget(gl, bw, bh, fallbackFormat, "linear");
			t.c ??= createRenderTarget(gl, bw, bh, fallbackFormat, "linear");
			t.d ??= createRenderTarget(gl, bw, bh, fallbackFormat, "linear");
			draw(p.b, t.b, [t.a.write], u, 0);
			draw(p.b, t.c, [t.b], u, 1);
			draw(p.b, t.d, [t.c], u, 2);
		}
		Object.assign(cellDisplayUniforms, u);
		cellDisplayUniforms.asciiMix = 1;
		draw(p.image, t.scene, [t.a.write], cellDisplayUniforms);
		draw(p.ascii, null, [
			t.scene,
			glyphTextures.atlas,
			glyphTextures.metrics,
			settings.enableBloomPass ? (t.d ?? fallbackTexture) : fallbackTexture,
		]);
	};

	return {
		kind: "webgl2",
		maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
		bytesPerPixel: fallbackFormat.type === gl.HALF_FLOAT ? 8 : 4,
		get bloomAllocated() {
			return Boolean(fallbackTargets?.d);
		},
		gpuFrameTimeMs: null,
		gpuTimingSupported: false,
		resize(width, height, sw, sh) {
			renderWidth = width;
			renderHeight = height;
			sceneWidth = sw;
			sceneHeight = sh;
			canvas.width = width;
			canvas.height = height;
			disposeTargets();
			const next: Partial<FallbackTargets> = {};
			try {
				next.a = createPingPongTarget(
					gl,
					sw,
					sh,
					fallbackFormat,
					cellGrid ? "nearest" : "linear",
				);
				next.scene = createRenderTarget(
					gl,
					sw,
					sh,
					cellGrid ? chooseByteTextureFormat(gl) : fallbackFormat,
					"linear",
				);
				fallbackTargets = next as FallbackTargets;
			} catch (error) {
				next.a?.dispose();
				disposeRenderTarget(gl, next.scene ?? null);
				throw error;
			}
		},
		setGlyphAtlas(config) {
			const next = createGlyphTextureSet(gl, config);
			glyphTextures.dispose();
			glyphTextures = next;
		},
		render(input: BackendFrame) {
			frame = input.frame;
			mouse = input.mouse;
			camera = input.camera;
			if (input.keyboard.some((v, i) => v !== previousKeyboard[i])) {
				updateKeyboardTexture(gl, keyboardTexture, input.keyboard);
				previousKeyboard.set(input.keyboard);
			}
			if (cellGrid) {
				renderCell(input);
				return;
			}
			renderFallback(
				input.time,
				input.delta,
				input.uniforms,
				input.asciiEnabled,
			);
		},
		dispose() {
			signal.removeEventListener("abort", dispose);
			dispose();
		},
	};
}
