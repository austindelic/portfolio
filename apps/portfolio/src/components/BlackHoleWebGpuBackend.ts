/// <reference types="@webgpu/types" />

import ascii from "../shaders/black-hole/webgpu/ascii.wgsl?raw";
import analysis from "../shaders/black-hole/webgpu/ascii-analysis.wgsl?raw";
import bufferA from "../shaders/black-hole/webgpu/buffer-a.wgsl?raw";
import bufferB from "../shaders/black-hole/webgpu/buffer-b.wgsl?raw";
import bufferC from "../shaders/black-hole/webgpu/buffer-c.wgsl?raw";
import bufferD from "../shaders/black-hole/webgpu/buffer-d.wgsl?raw";
import image from "../shaders/black-hole/webgpu/image.wgsl?raw";
import slots from "../shaders/black-hole/webgpu/uniform-layout.json";
import type {
	BackendFrame,
	BackendOptions,
	BlackHoleBackend,
} from "./BlackHoleBackend";
import { createGlyphAtlasRaster, type GlyphAtlasConfig } from "./BlackHoleCore";

const vertex = `@vertex fn main(@builtin(vertex_index) index:u32)->@builtin(position) vec4<f32> {
 let p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));return vec4(p[index],0.,1.);
}`;
type Texture = {
	texture: GPUTexture;
	view: GPUTextureView;
	width: number;
	height: number;
	sampler: GPUSampler;
	id: number;
};
type Pass = {
	pipeline: GPURenderPipeline;
	buffer: GPUBuffer;
	data: Float32Array;
	groups: Map<string, GPUBindGroup>;
};

export async function createWebGpuBackend({
	canvas,
	cellGrid,
	initialBloomStrength,
	settings,
	atlas,
	signal,
	onFailure,
	onInvalidate,
	profiling,
}: BackendOptions): Promise<BlackHoleBackend> {
	const cellShaders = cellGrid ? await import("./BlackHoleCellShaders") : null;
	if (!navigator.gpu)
		throw new Error("WebGPU is not available in this browser.");
	const adapter = await navigator.gpu.requestAdapter();
	signal.throwIfAborted();
	if (!adapter) throw new Error("No WebGPU adapter is available.");
	const timestamps = profiling && adapter.features.has("timestamp-query");
	const device = await adapter.requestDevice({
		requiredFeatures: timestamps ? ["timestamp-query"] : [],
	});
	let disposed = false;
	let nextId = 0;
	const textures = new Set<Texture>();
	const buffers = new Set<GPUBuffer>();
	const passes = new Map<string, Pass>();
	const format = navigator.gpu.getPreferredCanvasFormat();
	const context = canvas.getContext("webgpu");
	let query: GPUQuerySet | undefined,
		resolve: GPUBuffer | undefined,
		readback: GPUBuffer | undefined;
	let timingPending = false,
		gpuFrameTimeMs: number | null = null;
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		signal.removeEventListener("abort", dispose);
		for (const t of textures) t.texture.destroy();
		textures.clear();
		for (const b of buffers) b.destroy();
		buffers.clear();
		query?.destroy();
		context?.unconfigure();
		device.destroy();
	};
	signal.addEventListener("abort", dispose, { once: true });
	const fail = (error: unknown) => {
		if (!disposed) onFailure(error);
	};
	void device.lost.then((info) => {
		if (!disposed) fail(new Error(`WebGPU device lost: ${info.message}`));
	});
	device.addEventListener("uncapturederror", (event) => fail(event.error));
	const linear = device.createSampler({
		magFilter: "linear",
		minFilter: "linear",
	});
	const nearest = device.createSampler({
		magFilter: "nearest",
		minFilter: "nearest",
	});
	const makeBuffer = (size: number, usage: GPUBufferUsageFlags) => {
		const b = device.createBuffer({ size, usage });
		buffers.add(b);
		return b;
	};
	const makeTexture = (
		width: number,
		height: number,
		textureFormat: GPUTextureFormat = "rgba16float",
		sampler = linear,
	): Texture => {
		const texture = device.createTexture({
			size: [width, height],
			format: textureFormat,
			usage:
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.RENDER_ATTACHMENT |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.COPY_SRC,
		});
		const t = {
			texture,
			view: texture.createView(),
			width,
			height,
			sampler,
			id: ++nextId,
		};
		textures.add(t);
		return t;
	};
	const destroy = (t: Texture) => {
		t.texture.destroy();
		textures.delete(t);
	};
	const clearGroups = () => {
		for (const p of passes.values()) p.groups.clear();
	};
	const entries: GPUBindGroupLayoutEntry[] = [
		{
			binding: 0,
			visibility: GPUShaderStage.FRAGMENT,
			buffer: { type: "uniform", minBindingSize: 640 },
		},
	];
	for (let i = 0; i < 6; i++)
		entries.push(
			{
				binding: 1 + i * 2,
				visibility: GPUShaderStage.FRAGMENT,
				texture: { sampleType: "float" },
			},
			{
				binding: 2 + i * 2,
				visibility: GPUShaderStage.FRAGMENT,
				sampler: { type: "filtering" },
			},
		);
	const groupLayout = device.createBindGroupLayout({ entries });
	const layout = device.createPipelineLayout({
		bindGroupLayouts: [groupLayout],
	});
	const vertexModule = device.createShaderModule({ code: vertex });
	const compile = async (
		name: string,
		source: string,
		formats: GPUTextureFormat[],
		present = false,
	) => {
		// Offscreen rows keep GL's logical bottom-up indexing. Only presentation flips.
		const code = present
			? source.replace(
					"gl_FragCoord_1 = gl_FragCoord;",
					"gl_FragCoord_1 = vec4(gl_FragCoord.x, params.data[0].y - gl_FragCoord.y, gl_FragCoord.zw);",
				)
			: source;
		const module = device.createShaderModule({ label: name, code });
		const pipeline = await device.createRenderPipelineAsync({
			label: name,
			layout,
			vertex: { module: vertexModule, entryPoint: "main" },
			fragment: {
				module,
				entryPoint: "main",
				targets: formats.map((format) => ({ format })),
			},
			primitive: { topology: "triangle-list" },
		});
		signal.throwIfAborted();
		if (disposed) throw new Error("WebGPU initialization cancelled.");
		const pass = {
			pipeline,
			buffer: makeBuffer(640, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
			data: new Float32Array(160),
			groups: new Map<string, GPUBindGroup>(),
		};
		passes.set(name, pass);
		return pass;
	};
	let empty: Texture, glyph: Texture, metrics: Texture;
	let history: Texture[] = [],
		scene: Texture,
		bloom: Texture[] = [];
	let colors: Texture[] = [],
		states: Texture[] = [];
	let width = 1,
		height = 1,
		sw = 1,
		sh = 1,
		index = 0,
		analysisIndex = 0;
	let analysisKey = "",
		previousFrame = -2,
		previousAtlas = -1;
	const uploadAtlas = (config: GlyphAtlasConfig) => {
		const raster = createGlyphAtlasRaster(config);
		const nextGlyph = makeTexture(
			raster.canvas.width,
			raster.canvas.height,
			"rgba8unorm",
		);
		const nextMetrics = makeTexture(
			raster.metricsCanvas.width,
			raster.metricsCanvas.height,
			"rgba8unorm",
			nearest,
		);
		device.queue.copyExternalImageToTexture(
			{ source: raster.canvas, flipY: true },
			{ texture: nextGlyph.texture },
			[nextGlyph.width, nextGlyph.height],
		);
		device.queue.copyExternalImageToTexture(
			{ source: raster.metricsCanvas },
			{ texture: nextMetrics.texture },
			[nextMetrics.width, nextMetrics.height],
		);
		if (glyph) destroy(glyph);
		if (metrics) destroy(metrics);
		glyph = nextGlyph;
		metrics = nextMetrics;
		clearGroups();
	};
	const scoped = (fn: () => void) => {
		device.pushErrorScope("out-of-memory");
		device.pushErrorScope("validation");
		try {
			fn();
		} finally {
			void device.popErrorScope().then((error) => {
				if (error) fail(error);
			}, fail);
			void device.popErrorScope().then((error) => {
				if (error) fail(error);
			}, fail);
		}
	};
	try {
		signal.throwIfAborted();
		if (!context) throw new Error("Could not create WebGPU canvas context.");
		context.configure({ device, format, alphaMode: "opaque" });
		const compilation = await Promise.allSettled([
			compile("a", cellShaders?.trace ?? bufferA, ["rgba16float"]),
			compile("image", image, [cellGrid ? "rgba8unorm" : "rgba16float"]),
			compile("present", image, [format], true),
			compile("ascii", ascii, [format], true),
			compile("analysis", analysis, ["rgba8unorm", "rgba8unorm"]),
		]);
		for (const result of compilation)
			if (result.status === "rejected") throw result.reason;
		empty = makeTexture(1, 1, "rgba8unorm", nearest);
		device.queue.writeTexture(
			{ texture: empty.texture },
			new Uint8Array([0, 0, 0, 255]),
			{ bytesPerRow: 4 },
			[1, 1],
		);
		uploadAtlas(atlas);
		if (timestamps) {
			query = device.createQuerySet({ type: "timestamp", count: 2 });
			resolve = makeBuffer(
				256,
				GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
			);
			readback = makeBuffer(
				16,
				GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			);
		}
	} catch (error) {
		dispose();
		throw error;
	}
	let bloomReady = false;
	let bloomPending: Promise<void> | undefined;
	const prepareBloom = () => {
		bloomPending ??= Promise.allSettled([
			compile("b", cellShaders?.bloom ?? bufferB, ["rgba16float"]),
			compile("c", cellShaders?.bloom ?? bufferC, ["rgba16float"]),
			compile("d", cellShaders?.bloom ?? bufferD, ["rgba16float"]),
		]).then((results) => {
			for (const r of results) if (r.status === "rejected") throw r.reason;
			bloomReady = true;
		});
		return bloomPending;
	};
	// Preparation happens before accepting a contributing frame, without displaying
	// a bloom-less substitute. Later toggles retain the previous presented frame.
	if (initialBloomStrength !== 0) {
		try {
			await prepareBloom();
		} catch (error) {
			dispose();
			throw error;
		}
	}
	const draw = (
		encoder: GPUCommandEncoder,
		name: string,
		targets: GPUTextureView[],
		w: number,
		h: number,
		channels: Texture[],
		input: BackendFrame,
		frame = input.frame,
		canvasW = w,
		canvasH = h,
		timing?: GPURenderPassTimestampWrites,
	) => {
		const pass = passes.get(name);
		if (!pass) throw new Error(`Missing WebGPU pipeline: ${name}`);
		const data = pass.data;
		const set = (
			key: keyof typeof slots,
			values: number | ArrayLike<number>,
		) => {
			const offset = slots[key] * 4;
			if (typeof values === "number") data[offset] = values;
			else data.set(values, offset);
		};
		set("iResolution", [w, h, 1]);
		set("iTime", input.time);
		set("iTimeDelta", input.delta);
		set("iFrame", frame);
		set("iMouse", input.mouse);
		channels.slice(0, 4).forEach((t, i) => {
			data.set([t.width, t.height, 1], (slots.iChannelResolution + i) * 4);
		});
		set("uCameraPosition", input.camera.position);
		set("uCameraRight", input.camera.right);
		set("uCameraUp", input.camera.up);
		set("uUniverseSign", input.camera.universeSign);
		set("uQuality", settings.qualityValue);
		set("uBlendWeight", 0.5);
		set("uCanvasResolution", [canvasW, canvasH]);
		const u = input.uniforms;
		set("uTemporalJitter", u.temporalJitter);
		set("uAsciiCellSize", [u.asciiCellSize.x, u.asciiCellSize.y]);
		set("uAsciiMix", cellGrid && name === "image" ? 1 : u.asciiMix);
		set("uBloomMode", cellGrid ? ({ b: 0, c: 1, d: 2 }[name] ?? 0) : 0);
		set("uGlyphCount", u.glyphCount);
		set("uAsciiBrightness", u.asciiBrightness);
		set("uAsciiContrast", u.asciiContrast);
		set("uPaletteMode", u.paletteMode);
		set("uShadowColor", u.shadowColor);
		set("uMidColor", u.midColor);
		set("uHighlightColor", u.highlightColor);
		set("uExposure", u.exposure);
		set("uBloomStrength", u.bloomStrength);
		device.queue.writeBuffer(pass.buffer, 0, data);
		const key = channels.map((t) => t.id).join("/");
		let group = pass.groups.get(key);
		if (!group) {
			const bindings: GPUBindGroupEntry[] = [
				{ binding: 0, resource: { buffer: pass.buffer } },
			];
			for (let i = 0; i < 6; i++) {
				const t = channels[i] ?? empty;
				bindings.push(
					{ binding: 1 + i * 2, resource: t.view },
					{ binding: 2 + i * 2, resource: t.sampler },
				);
			}
			group = device.createBindGroup({
				layout: groupLayout,
				entries: bindings,
			});
			pass.groups.set(key, group);
		}
		const render = encoder.beginRenderPass({
			colorAttachments: targets.map((view) => ({
				view,
				loadOp: "clear",
				storeOp: "store",
				clearValue: [0, 0, 0, 0],
			})),
			timestampWrites: timing,
		});
		render.setPipeline(pass.pipeline);
		render.setBindGroup(0, group);
		render.draw(3);
		render.end();
	};
	return {
		kind: "webgpu",
		maxTextureSize: device.limits.maxTextureDimension2D,
		bytesPerPixel: 8,
		get bloomAllocated() {
			return bloom.length > 0;
		},
		get gpuFrameTimeMs() {
			return gpuFrameTimeMs;
		},
		gpuTimingSupported: timestamps,
		resize(w, h, sceneW, sceneH) {
			scoped(() => {
				width = w;
				height = h;
				sw = sceneW;
				sh = sceneH;
				canvas.width = w;
				canvas.height = h;
				for (const t of [
					...history,
					...bloom,
					...colors,
					...states,
					...(scene ? [scene] : []),
				])
					destroy(t);
				history = [];
				bloom = [];
				colors = [];
				states = [];
				analysisKey = "";
				index = 0;
				previousFrame = -2;
				history = [
					makeTexture(sw, sh, "rgba16float", cellGrid ? nearest : linear),
					makeTexture(sw, sh, "rgba16float", cellGrid ? nearest : linear),
				];
				scene = makeTexture(sw, sh, cellGrid ? "rgba8unorm" : "rgba16float");
				clearGroups();
			});
		},
		setGlyphAtlas(config) {
			scoped(() => uploadAtlas(config));
		},
		render(input) {
			if (disposed) return;
			const hasBloom =
				input.uniforms.bloomStrength !== 0 &&
				(!cellGrid || settings.enableBloomPass);
			const bw = cellGrid
					? Math.max(2, Math.ceil(sw * settings.bloomScale))
					: sw,
				bh = cellGrid ? Math.max(2, Math.ceil(sh * settings.bloomScale)) : sh;
			if (hasBloom && !bloomReady) {
				void prepareBloom().then(onInvalidate, fail);
				return false;
			}
			if (hasBloom && !bloom.length)
				scoped(() => {
					bloom = [
						makeTexture(bw, bh),
						makeTexture(bw, bh),
						makeTexture(bw, bh),
					];
				});
			const encoder = device.createCommandEncoder();
			const timed =
				query && resolve && readback && !timingPending
					? { query, resolve, readback }
					: undefined;
			const begin = timed
				? { querySet: timed.query, beginningOfPassWriteIndex: 0 }
				: undefined;
			const end = timed
				? { querySet: timed.query, endOfPassWriteIndex: 1 }
				: undefined;
			draw(
				encoder,
				"a",
				[history[1 - index].view],
				sw,
				sh,
				[empty, empty, empty, history[index]],
				input,
				input.frame,
				cellGrid ? width : sw,
				cellGrid ? height : sh,
				begin,
			);
			if (hasBloom) {
				draw(
					encoder,
					"b",
					[bloom[0].view],
					bw,
					bh,
					[history[1 - index], empty, empty, empty],
					input,
				);
				draw(encoder, "c", [bloom[1].view], bw, bh, [bloom[0]], input);
				draw(encoder, "d", [bloom[2].view], bw, bh, [bloom[1]], input);
			}
			const sceneChannels = [
				history[1 - index],
				bloom[0] ?? empty,
				bloom[1] ?? empty,
				bloom[2] ?? empty,
			];
			if (input.asciiEnabled || cellGrid) {
				draw(
					encoder,
					"image",
					[scene.view],
					sw,
					sh,
					cellGrid ? [history[1 - index], empty, empty, empty] : sceneChannels,
					input,
				);
				const cell = input.uniforms.asciiCellSize;
				const cw = Math.ceil(width / Math.max(2, cell.x)),
					ch = Math.ceil(height / Math.max(2, cell.y));
				const key = `${width}/${height}/${cell.x}/${cell.y}/${input.camera.asciiHistoryVersion ?? 0}`;
				if (key !== analysisKey) {
					scoped(() => {
						for (const t of [...colors, ...states]) destroy(t);
						colors = [
							makeTexture(cw, ch, "rgba8unorm", nearest),
							makeTexture(cw, ch, "rgba8unorm", nearest),
						];
						states = [
							makeTexture(cw, ch, "rgba8unorm", nearest),
							makeTexture(cw, ch, "rgba8unorm", nearest),
						];
					});
					analysisKey = key;
					previousFrame = -2;
					analysisIndex = 0;
					clearGroups();
				}
				const valid =
					previousFrame === input.frame - 1 && previousAtlas === glyph.id;
				draw(
					encoder,
					"analysis",
					[colors[1 - analysisIndex].view, states[1 - analysisIndex].view],
					cw,
					ch,
					[scene, states[analysisIndex], metrics, colors[analysisIndex]],
					input,
					Number(valid),
					width,
					height,
				);
				analysisIndex = 1 - analysisIndex;
				previousFrame = input.frame;
				previousAtlas = glyph.id;
				draw(
					encoder,
					"ascii",
					[context?.getCurrentTexture().createView()],
					width,
					height,
					[
						scene,
						glyph,
						metrics,
						settings.enableBloomPass ? (bloom[2] ?? empty) : empty,
						colors[analysisIndex],
						states[analysisIndex],
					],
					input,
					input.frame,
					width,
					height,
					end,
				);
			} else
				draw(
					encoder,
					"present",
					[context?.getCurrentTexture().createView()],
					width,
					height,
					sceneChannels,
					input,
					input.frame,
					width,
					height,
					end,
				);
			index = 1 - index;
			if (timed) {
				encoder.resolveQuerySet(timed.query, 0, 2, timed.resolve, 0);
				encoder.copyBufferToBuffer(timed.resolve, 0, timed.readback, 0, 16);
			}
			device.queue.submit([encoder.finish()]);
			if (timed) {
				timingPending = true;
				void timed.readback
					.mapAsync(GPUMapMode.READ)
					.then(
						() => {
							if (!disposed) {
								const times = new BigUint64Array(
									timed.readback.getMappedRange(),
								);
								gpuFrameTimeMs = Number(times[1] - times[0]) / 1e6;
								timed.readback.unmap();
							}
						},
						() => {},
					)
					.finally(() => {
						timingPending = false;
					});
			}
		},
		dispose,
	};
}
