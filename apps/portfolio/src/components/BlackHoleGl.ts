import BLACK_HOLE_HELPERS from "@repo/black-hole/shaders/helpers.glsl?raw";
import FRAGMENT_HEADER from "@repo/black-hole/shaders/fragment-header.glsl?raw";
import asciiAnalysisSource from "@repo/black-hole/shaders/ascii-analysis.glsl?raw";
import bufferASource from "@repo/black-hole/shaders/buffer-a.glsl?raw";
import { submitPrograms } from "./BlackHoleCompilation";
import {
	type AsciiCellSize,
	type CameraState,
	createGlyphAtlasRaster,
	DEFAULT_RENDER_UNIFORMS,
	type GlyphAtlasConfig,
	type GlyphTextureSet,
	type MultiRenderTarget,
	type PingPongTarget,
	type ProgramPass,
	type RenderTarget,
	type RenderUniforms,
	type TextureFormat,
	type TextureLike,
} from "./BlackHoleCore";
export const VERTEX_SOURCE = `#version 300 es
in vec2 aPosition;
void main() {
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export { FRAGMENT_HEADER };

export { BLACK_HOLE_HELPERS };

export const FALLBACK_CHANNEL_RESOLUTIONS = new Float32Array(12);
export function cleanShaderSource(name: string, source: string): string {
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

export function getBlackHoleCoreSource(): string {
	const marker = "// SECTION 9: mainImage";
	const index = bufferASource.indexOf(marker);
	if (index < 0) throw new Error("Could not locate Buffer A mainImage marker.");
	return cleanShaderSource("Black Hole Core", bufferASource.slice(0, index));
}

export function createStandardFragmentSource(
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

export function createBlackHoleFragmentSource(entrySource: string): string {
	return `${FRAGMENT_HEADER}
${getBlackHoleCoreSource()}
${BLACK_HOLE_HELPERS}
${entrySource}
`;
}

export function createPass(
	gl: WebGL2RenderingContext,
	name: string,
	fragmentSource: string,
): ProgramPass {
	const batch = submitPrograms(gl, [
		{ name, vertex: VERTEX_SOURCE, fragment: fragmentSource },
	]);
	const programs = batch.finish(true);
	if (!programs) throw new Error("Shader compilation was cancelled.");
	return initializePass(gl, name, programs[0]);
}

export function initializePass(
	gl: WebGL2RenderingContext,
	name: string,
	program: WebGLProgram,
): ProgramPass {
	const pass: ProgramPass = {
		channels: [],
		vao: null,
		uniformCache: new Map(),
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
			uTemporalJitter: gl.getUniformLocation(program, "uTemporalJitter"),
			uBlendWeight: gl.getUniformLocation(program, "uBlendWeight"),
			uBloomMode: gl.getUniformLocation(program, "uBloomMode"),
			uCanvasResolution: gl.getUniformLocation(program, "uCanvasResolution"),
			uAsciiCellSize: gl.getUniformLocation(program, "uAsciiCellSize"),
			uAsciiMix: gl.getUniformLocation(program, "uAsciiMix"),
			uGlyphCount: gl.getUniformLocation(program, "uGlyphCount"),
			uAsciiBrightness: gl.getUniformLocation(program, "uAsciiBrightness"),
			uAsciiContrast: gl.getUniformLocation(program, "uAsciiContrast"),
			uPaletteMode: gl.getUniformLocation(program, "uPaletteMode"),
			uShadowColor: gl.getUniformLocation(program, "uShadowColor"),
			uMidColor: gl.getUniformLocation(program, "uMidColor"),
			uHighlightColor: gl.getUniformLocation(program, "uHighlightColor"),
			uExposure: gl.getUniformLocation(program, "uExposure"),
			uBloomStrength: gl.getUniformLocation(program, "uBloomStrength"),
			uAsciiAnalysisColor: gl.getUniformLocation(
				program,
				"uAsciiAnalysisColor",
			),
			uAsciiAnalysisState: gl.getUniformLocation(
				program,
				"uAsciiAnalysisState",
			),
		},
	};
	// Sampler indices are program state and never change during its lifetime.
	// biome-ignore lint/correctness/useHookAtTopLevel: Native WebGL API, not a React hook.
	gl.useProgram(program);
	pass.locations.iChannels.forEach((location, unit) => {
		if (location) gl.uniform1i(location, unit);
	});
	return pass;
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

export function chooseByteTextureFormat(
	gl: WebGL2RenderingContext,
): TextureFormat {
	return {
		internalFormat: gl.RGBA8,
		format: gl.RGBA,
		type: gl.UNSIGNED_BYTE,
		canFilterLinear: true,
	};
}

export function chooseFallbackTextureFormat(
	gl: WebGL2RenderingContext,
): TextureFormat {
	const floatFormat = chooseFloatTextureFormat(gl);
	if (floatFormat) {
		try {
			const probe = createRenderTarget(gl, 1, 1, floatFormat, "linear");
			gl.deleteTexture(probe.texture);
			gl.deleteFramebuffer(probe.framebuffer);
			return floatFormat;
		} catch {
			// Devices without a complete float framebuffer retain the byte fallback.
		}
	}
	return chooseByteTextureFormat(gl);
}

export function formatGlError(
	gl: WebGL2RenderingContext,
	error: number,
): string {
	switch (error) {
		case gl.INVALID_ENUM:
			return "INVALID_ENUM";
		case gl.INVALID_VALUE:
			return "INVALID_VALUE";
		case gl.INVALID_OPERATION:
			return "INVALID_OPERATION";
		case gl.INVALID_FRAMEBUFFER_OPERATION:
			return "INVALID_FRAMEBUFFER_OPERATION";
		case gl.OUT_OF_MEMORY:
			return "OUT_OF_MEMORY";
		case gl.CONTEXT_LOST_WEBGL:
			return "CONTEXT_LOST_WEBGL";
		default:
			return `0x${error.toString(16)}`;
	}
}

export function clearGlErrors(gl: WebGL2RenderingContext) {
	for (let i = 0; i < 16; i++) {
		if (gl.getError() === gl.NO_ERROR) return;
	}
}

export function createRenderTarget(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	format: TextureFormat,
	filter: "linear" | "nearest",
): RenderTarget {
	const texture = gl.createTexture();
	const framebuffer = gl.createFramebuffer();

	if (!texture || !framebuffer) {
		if (texture) gl.deleteTexture(texture);
		if (framebuffer) gl.deleteFramebuffer(framebuffer);
		throw new Error(`Could not create render target (${width}x${height}).`);
	}

	const glFilter =
		filter === "linear" && format.canFilterLinear ? gl.LINEAR : gl.NEAREST;
	clearGlErrors(gl);
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
	const textureError = gl.getError();
	if (textureError !== gl.NO_ERROR) {
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.deleteTexture(texture);
		gl.deleteFramebuffer(framebuffer);
		throw new Error(
			`Could not allocate render target texture (${width}x${height}, ${formatGlError(
				gl,
				textureError,
			)}).`,
		);
	}

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
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.deleteTexture(texture);
		gl.deleteFramebuffer(framebuffer);
		throw new Error(
			`Render target framebuffer is incomplete (${width}x${height}).`,
		);
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return { texture, framebuffer, width, height };
}

export function createMultiRenderTarget(
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
	clearGlErrors(gl);

	try {
		for (let i = 0; i < count; i++) {
			const texture = gl.createTexture();
			if (!texture)
				throw new Error(
					`Could not create multi render target texture ${i + 1}/${count} (${width}x${height}).`,
				);
			textures.push({ texture, width, height });

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
			const textureError = gl.getError();
			if (textureError !== gl.NO_ERROR) {
				throw new Error(
					`Could not allocate multi render target texture ${i + 1}/${count} (${width}x${height}, ${formatGlError(
						gl,
						textureError,
					)}).`,
				);
			}

			const attachment = gl.COLOR_ATTACHMENT0 + i;
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				attachment,
				gl.TEXTURE_2D,
				texture,
				0,
			);
			attachments.push(attachment);
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

export function createPingPongTarget(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	format: TextureFormat,
	filter: "linear" | "nearest",
): PingPongTarget {
	const initialRead = createRenderTarget(gl, width, height, format, filter);

	try {
		const initialWrite = createRenderTarget(gl, width, height, format, filter);
		let read = initialRead;
		let write = initialWrite;

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
	} catch (error) {
		disposeRenderTarget(gl, initialRead);
		throw error;
	}
}

export function disposeRenderTarget(
	gl: WebGL2RenderingContext,
	target: RenderTarget | null,
) {
	if (!target) return;
	gl.deleteTexture(target.texture);
	gl.deleteFramebuffer(target.framebuffer);
}

export function createSolidTexture(
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

export function createKeyboardTexture(
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

export function createCanvasTexture(
	gl: WebGL2RenderingContext,
	canvas: HTMLCanvasElement,
	filter: number,
	flipY: boolean,
	errorMessage: string,
): TextureLike {
	const texture = gl.createTexture();

	if (!texture) throw new Error(errorMessage);

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return { texture, width: canvas.width, height: canvas.height };
}

export function createGlyphTextureSet(
	gl: WebGL2RenderingContext,
	config: GlyphAtlasConfig,
): GlyphTextureSet {
	const raster = createGlyphAtlasRaster(config);
	const atlas = createCanvasTexture(
		gl,
		raster.canvas,
		gl.LINEAR,
		true,
		"Could not create ASCII glyph atlas texture.",
	);

	try {
		const metrics = createCanvasTexture(
			gl,
			raster.metricsCanvas,
			gl.NEAREST,
			false,
			"Could not create ASCII glyph metrics texture.",
		);

		return {
			atlas,
			metrics,
			dispose: () => {
				gl.deleteTexture(atlas.texture);
				gl.deleteTexture(metrics.texture);
			},
		};
	} catch (error) {
		gl.deleteTexture(atlas.texture);
		throw error;
	}
}

export function updateKeyboardTexture(
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

export function fillChannelResolution(
	channels: TextureLike[],
	output: Float32Array,
) {
	output.set(FALLBACK_CHANNEL_RESOLUTIONS);

	for (let i = 0; i < 4; i++) {
		const channel = channels[i];
		output[i * 3] = channel.width;
		output[i * 3 + 1] = channel.height;
		output[i * 3 + 2] = 1;
	}
}

export function uniformChanged(
	pass: ProgramPass,
	location: WebGLUniformLocation,
	a: number,
	b?: number,
	c?: number,
): boolean {
	const cached = pass.uniformCache.get(location);
	if (cached && cached[0] === a && cached[1] === b && cached[2] === c)
		return false;
	if (cached) {
		cached[0] = a;
		cached[1] = b;
		cached[2] = c;
	} else pass.uniformCache.set(location, [a, b, c]);
	return true;
}

export function uniformArrayChanged(
	pass: ProgramPass,
	location: WebGLUniformLocation,
	values: ArrayLike<number>,
): boolean {
	const cached = pass.uniformCache.get(location);
	if (!cached) {
		pass.uniformCache.set(location, Array.from(values));
		return true;
	}
	let changed = false;
	for (let i = 0; i < values.length; i++) {
		if (cached[i] !== values[i]) {
			cached[i] = values[i];
			changed = true;
		}
	}
	return changed;
}

export function disposeProgramPass(
	gl: WebGL2RenderingContext,
	pass: ProgramPass,
) {
	if (pass.analysis) {
		pass.analysis.read.dispose();
		pass.analysis.write.dispose();
		disposeProgramPass(gl, pass.analysis.pass);
	}
	gl.deleteVertexArray(pass.vao);
	gl.deleteProgram(pass.program);
}

export function renderPass(
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
	channel0: TextureLike,
	channel1: TextureLike,
	channel2: TextureLike,
	channel3: TextureLike,
	camera: CameraState,
	qualityValue: number,
	blendWeight: number,
	bloomMode: number,
	channelResolutionScratch: Float32Array,
	renderUniforms: RenderUniforms = DEFAULT_RENDER_UNIFORMS,
	canvasResolution: AsciiCellSize | null = null,
) {
	const channels = pass.channels;
	channels[0] = channel0;
	channels[1] = channel1;
	channels[2] = channel2;
	channels[3] = channel3;
	if (pass.locations.uAsciiAnalysisColor) {
		const cellsX = Math.ceil(
			width / Math.max(2, renderUniforms.asciiCellSize.x),
		);
		const cellsY = Math.ceil(
			height / Math.max(2, renderUniforms.asciiCellSize.y),
		);
		const key = `${width}/${height}/${renderUniforms.asciiCellSize.x}/${renderUniforms.asciiCellSize.y}/${camera.asciiHistoryVersion ?? 0}`;
		if (!pass.analysis || pass.analysis.key !== key) {
			if (pass.analysis) {
				pass.analysis.read.dispose();
				pass.analysis.write.dispose();
				disposeProgramPass(gl, pass.analysis.pass);
			}
			pass.analysis = {
				pass: createPass(
					gl,
					"ASCII Analysis",
					FRAGMENT_HEADER + asciiAnalysisSource,
				),
				read: createMultiRenderTarget(
					gl,
					cellsX,
					cellsY,
					chooseByteTextureFormat(gl),
					2,
				),
				write: createMultiRenderTarget(
					gl,
					cellsX,
					cellsY,
					chooseByteTextureFormat(gl),
					2,
				),
				key,
				atlas: channels[1].texture,
				frame: -2,
			};
		}
		const analysis = pass.analysis;
		const valid =
			analysis.frame === frame - 1 && analysis.atlas === channels[1].texture;
		renderPass(
			gl,
			analysis.pass,
			vertexBuffer,
			analysis.write,
			cellsX,
			cellsY,
			time,
			delta,
			valid ? 1 : 0,
			mouse,
			channels[0],
			analysis.read.textures[1],
			channels[2],
			analysis.read.textures[0],
			camera,
			qualityValue,
			blendWeight,
			0,
			channelResolutionScratch,
			renderUniforms,
			{ x: width, y: height },
		);
		[analysis.read, analysis.write] = [analysis.write, analysis.read];
		analysis.frame = frame;
		analysis.atlas = channels[1].texture;
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
	if (target && "textures" in target)
		gl.drawBuffers(target.textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
	else gl.drawBuffers([target ? gl.COLOR_ATTACHMENT0 : gl.BACK]);

	gl.viewport(0, 0, width, height);
	// biome-ignore lint/correctness/useHookAtTopLevel: Native WebGL API, not a React hook.
	gl.useProgram(pass.program);

	if (!pass.vao) {
		pass.vao = gl.createVertexArray();
		if (!pass.vao)
			throw new Error(`Could not create ${pass.name} vertex array.`);
		gl.bindVertexArray(pass.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		gl.enableVertexAttribArray(pass.locations.position);
		gl.vertexAttribPointer(pass.locations.position, 2, gl.FLOAT, false, 0, 0);
	} else {
		gl.bindVertexArray(pass.vao);
	}

	if (
		pass.locations.iResolution &&
		uniformChanged(pass, pass.locations.iResolution, width, height, 1)
	)
		gl.uniform3f(pass.locations.iResolution, width, height, 1);
	if (pass.locations.iTime && uniformChanged(pass, pass.locations.iTime, time))
		gl.uniform1f(pass.locations.iTime, time);
	if (
		pass.locations.iTimeDelta &&
		uniformChanged(pass, pass.locations.iTimeDelta, delta)
	)
		gl.uniform1f(pass.locations.iTimeDelta, delta);
	if (
		pass.locations.iFrame &&
		uniformChanged(pass, pass.locations.iFrame, frame)
	)
		gl.uniform1i(pass.locations.iFrame, frame);
	if (
		pass.locations.iMouse &&
		uniformArrayChanged(pass, pass.locations.iMouse, mouse)
	)
		gl.uniform4fv(pass.locations.iMouse, mouse);
	if (
		pass.locations.uCanvasResolution &&
		uniformChanged(
			pass,
			pass.locations.uCanvasResolution,
			canvasResolution?.x ?? width,
			canvasResolution?.y ?? height,
		)
	)
		gl.uniform2f(
			pass.locations.uCanvasResolution,
			canvasResolution?.x ?? width,
			canvasResolution?.y ?? height,
		);
	if (
		pass.locations.uCameraPosition &&
		uniformArrayChanged(pass, pass.locations.uCameraPosition, camera.position)
	)
		gl.uniform3fv(pass.locations.uCameraPosition, camera.position);
	if (
		pass.locations.uCameraRight &&
		uniformArrayChanged(pass, pass.locations.uCameraRight, camera.right)
	)
		gl.uniform3fv(pass.locations.uCameraRight, camera.right);
	if (
		pass.locations.uCameraUp &&
		uniformArrayChanged(pass, pass.locations.uCameraUp, camera.up)
	)
		gl.uniform3fv(pass.locations.uCameraUp, camera.up);
	if (
		pass.locations.uUniverseSign &&
		uniformChanged(pass, pass.locations.uUniverseSign, camera.universeSign)
	)
		gl.uniform1f(pass.locations.uUniverseSign, camera.universeSign);
	if (
		pass.locations.uQuality &&
		uniformChanged(pass, pass.locations.uQuality, qualityValue)
	)
		gl.uniform1f(pass.locations.uQuality, qualityValue);
	if (
		pass.locations.uTemporalJitter &&
		uniformChanged(
			pass,
			pass.locations.uTemporalJitter,
			renderUniforms.temporalJitter,
		)
	)
		gl.uniform1f(pass.locations.uTemporalJitter, renderUniforms.temporalJitter);
	if (
		pass.locations.uBlendWeight &&
		uniformChanged(pass, pass.locations.uBlendWeight, blendWeight)
	)
		gl.uniform1f(pass.locations.uBlendWeight, blendWeight);
	if (
		pass.locations.uBloomMode &&
		uniformChanged(pass, pass.locations.uBloomMode, bloomMode)
	)
		gl.uniform1i(pass.locations.uBloomMode, bloomMode);
	if (
		pass.locations.uAsciiCellSize &&
		uniformChanged(
			pass,
			pass.locations.uAsciiCellSize,
			renderUniforms.asciiCellSize.x,
			renderUniforms.asciiCellSize.y,
		)
	)
		gl.uniform2f(
			pass.locations.uAsciiCellSize,
			renderUniforms.asciiCellSize.x,
			renderUniforms.asciiCellSize.y,
		);
	if (
		pass.locations.uAsciiMix &&
		uniformChanged(pass, pass.locations.uAsciiMix, renderUniforms.asciiMix)
	)
		gl.uniform1f(pass.locations.uAsciiMix, renderUniforms.asciiMix);
	if (
		pass.locations.uGlyphCount &&
		uniformChanged(pass, pass.locations.uGlyphCount, renderUniforms.glyphCount)
	)
		gl.uniform1i(pass.locations.uGlyphCount, renderUniforms.glyphCount);
	if (
		pass.locations.uAsciiBrightness &&
		uniformChanged(
			pass,
			pass.locations.uAsciiBrightness,
			renderUniforms.asciiBrightness,
		)
	)
		gl.uniform1f(
			pass.locations.uAsciiBrightness,
			renderUniforms.asciiBrightness,
		);
	if (
		pass.locations.uAsciiContrast &&
		uniformChanged(
			pass,
			pass.locations.uAsciiContrast,
			renderUniforms.asciiContrast,
		)
	)
		gl.uniform1f(pass.locations.uAsciiContrast, renderUniforms.asciiContrast);
	if (
		pass.locations.uPaletteMode &&
		uniformChanged(
			pass,
			pass.locations.uPaletteMode,
			renderUniforms.paletteMode,
		)
	)
		gl.uniform1i(pass.locations.uPaletteMode, renderUniforms.paletteMode);
	if (
		pass.locations.uShadowColor &&
		uniformArrayChanged(
			pass,
			pass.locations.uShadowColor,
			renderUniforms.shadowColor,
		)
	)
		gl.uniform3fv(pass.locations.uShadowColor, renderUniforms.shadowColor);
	if (
		pass.locations.uMidColor &&
		uniformArrayChanged(pass, pass.locations.uMidColor, renderUniforms.midColor)
	)
		gl.uniform3fv(pass.locations.uMidColor, renderUniforms.midColor);
	if (
		pass.locations.uHighlightColor &&
		uniformArrayChanged(
			pass,
			pass.locations.uHighlightColor,
			renderUniforms.highlightColor,
		)
	)
		gl.uniform3fv(
			pass.locations.uHighlightColor,
			renderUniforms.highlightColor,
		);
	if (
		pass.locations.uExposure &&
		uniformChanged(pass, pass.locations.uExposure, renderUniforms.exposure)
	)
		gl.uniform1f(pass.locations.uExposure, renderUniforms.exposure);
	if (
		pass.locations.uBloomStrength &&
		uniformChanged(
			pass,
			pass.locations.uBloomStrength,
			renderUniforms.bloomStrength,
		)
	)
		gl.uniform1f(pass.locations.uBloomStrength, renderUniforms.bloomStrength);

	if (pass.locations.iChannelResolution) {
		fillChannelResolution(channels, channelResolutionScratch);
		if (
			uniformArrayChanged(
				pass,
				pass.locations.iChannelResolution,
				channelResolutionScratch,
			)
		)
			gl.uniform3fv(
				pass.locations.iChannelResolution,
				channelResolutionScratch,
			);
	}

	for (let i = 0; i < 4; i++) {
		if (!pass.locations.iChannels[i]) continue;
		gl.activeTexture(gl.TEXTURE0 + i);
		gl.bindTexture(gl.TEXTURE_2D, channels[i].texture);
	}

	if (pass.analysis) {
		for (const [index, location] of [
			pass.locations.uAsciiAnalysisColor,
			pass.locations.uAsciiAnalysisState,
		].entries()) {
			gl.activeTexture(gl.TEXTURE4 + index);
			gl.bindTexture(gl.TEXTURE_2D, pass.analysis.read.textures[index].texture);
			gl.uniform1i(location, 4 + index);
		}
	}

	gl.drawArrays(gl.TRIANGLES, 0, 3);
}
