// Run via Playwright CLI: run-code --filename=apps/portfolio/tests/ascii-analysis.browser.cjs
async function testAsciiAnalysis(page) {
	return await page.evaluate(async () => {
		const { analysis: source, ascii, analysisWgsl } = await import(
			"/tests/shader-fixtures.ts"
		);
		const gl = document.createElement("canvas").getContext("webgl2");
		if (!gl) throw Error("WebGL2 unavailable");
		const compile = (type, src) => {
			const sh = gl.createShader(type);
			gl.shaderSource(sh, src);
			gl.compileShader(sh);
			if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
				throw Error(gl.getShaderInfoLog(sh));
			return sh;
		};
		const program = gl.createProgram();
		gl.attachShader(
			program,
			compile(
				gl.VERTEX_SHADER,
				"#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}",
			),
		);
		gl.attachShader(
			program,
			compile(
				gl.FRAGMENT_SHADER,
				`#version 300 es
precision highp float; precision highp int;
uniform sampler2D iChannel0,iChannel1,iChannel2,iChannel3;
uniform vec2 uAsciiCellSize,uCanvasResolution;
uniform float uQuality,uAsciiContrast,uAsciiBrightness;
uniform int iFrame,uGlyphCount;
${source}`,
			),
		);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw Error(gl.getProgramInfoLog(program));
		gl.useProgram(program);
		const texture = (w, h, data) => {
			const t = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, t);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA8,
				w,
				h,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				data,
			);
			return t;
		};
		const f = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, f);
		const outputs = [texture(1, 1, null), texture(1, 1, null)];
		outputs.forEach((t, i) =>
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0 + i,
				gl.TEXTURE_2D,
				t,
				0,
			),
		);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
			throw Error("Byte analysis MRT unavailable");
		const cases = [];
		const run = (
			samples,
			metrics,
			previous = 0,
			previousLum = 0,
			history = false,
			size = [6, 9],
		) => {
			const inputs = [
				texture(
					4,
					4,
					new Uint8Array(
						samples.flatMap((v) => [v * 255, v * 255, v * 255, 255]),
					),
				),
				texture(1, 1, new Uint8Array([previous, 0, 0, 255])),
				texture(
					metrics.length,
					1,
					new Uint8Array(
						metrics.flatMap((m) => [m[0] * 255, m[0] * 255, m[1], 255]),
					),
				),
				texture(1, 1, new Uint8Array([0, 0, 0, previousLum * 255])),
			];
			inputs.forEach((t, i) => {
				gl.activeTexture(gl.TEXTURE0 + i);
				gl.bindTexture(gl.TEXTURE_2D, t);
				gl.uniform1i(gl.getUniformLocation(program, `iChannel${i}`), i);
			});
			for (const name of ["uCanvasResolution", "uAsciiCellSize"])
				gl.uniform2f(gl.getUniformLocation(program, name), ...size);
			gl.uniform1f(gl.getUniformLocation(program, "uQuality"), 1);
			gl.uniform1f(gl.getUniformLocation(program, "uAsciiContrast"), 1);
			gl.uniform1f(gl.getUniformLocation(program, "uAsciiBrightness"), 0);
			gl.uniform1i(
				gl.getUniformLocation(program, "uGlyphCount"),
				metrics.length,
			);
			gl.uniform1i(gl.getUniformLocation(program, "iFrame"), history ? 1 : 0);
			gl.viewport(0, 0, 1, 1);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			const color = new Uint8Array(4),
				state = new Uint8Array(4);
			gl.readBuffer(gl.COLOR_ATTACHMENT0);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color);
			gl.readBuffer(gl.COLOR_ATTACHMENT1);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, state);
			inputs.forEach((t) => gl.deleteTexture(t));
			const result = { color: [...color], state: [...state] };
			cases.push({
				samples,
				metrics,
				previous,
				previousLum,
				history,
				size,
				result,
			});
			return result;
		};
		const checks = [];
		const assert = (ok, name) => {
			if (!ok) throw Error(name);
			checks.push(name);
		};
		const metrics = [
			[0, 0],
			[0.5, 0],
			[0.5, 1],
			[0.5, 2],
			[0.5, 3],
			[0.5, 4],
			[1, 0],
		];
		const samples = (fn) =>
			Array.from({ length: 16 }, (_, i) => fn(i % 4, Math.floor(i / 4)));
		const horizontal = run(
			samples((x, y) => (y > 1 ? 1 : 0)),
			metrics,
		);
		assert(horizontal.state[0] === 2, "horizontal tangent selects dash");
		const vertical = run(
			samples((x, y) => (x > 1 ? 1 : 0)),
			metrics,
		);
		assert(vertical.state[0] === 4, "vertical tangent selects bar");
		const positive = run(
			samples((x, y) => 0.5 + (y - x) / 8),
			metrics,
			0,
			0,
			false,
			[8, 8],
		);
		assert(positive.state[0] === 3, "positive diagonal selects slash");
		const negative = run(
			samples((x, y) => 0.1 + (x + y) / 8),
			metrics,
			0,
			0,
			false,
			[8, 8],
		);
		assert(negative.state[0] === 5, "negative diagonal selects backslash");
		const aspect = run(
			samples((x, y) => 0.5 + ((y - 1.5) * 2 - (x - 1.5)) / 12),
			metrics,
			0,
			0,
			false,
			[6, 12],
		);
		assert(
			aspect.state[0] === 3,
			"rectangular cells correct tangent in pixel space",
		);
		const restrained = run(samples((x) => (x < 2 ? 127 : 129) / 255), metrics, 0, 0, false, [12, 8]);
		assert(restrained.state[0] === 1 && restrained.state[1] > 0,
			"weak contour retains letters while boundary confidence stays independent");
		const cancelled = run(samples((x, y) => (x === 1 && y === 1 ? 1 : 0.5)), metrics);
		assert(cancelled.state[0] === 1, "cancelled Sobel neighbourhood rejects directional candidates");
		const flat = run(
			samples(() => 0.5),
			metrics,
		);
		assert(
			flat.state[0] === 1,
			"flat cell uses letter rather than directional symbol",
		);
		const peak = run(
			samples((x, y) => (x === 0 && y === 0 ? 1 : 0)),
			metrics,
		);
		assert(
			Math.abs(peak.color[3] / 255 - 1 / 16) < 0.008,
			"isolated peak does not boost mean luminance",
		);
		assert(
			horizontal.color[3] / 255 > 0.54 && horizontal.color[3] / 255 < 0.56,
			"coherent bright coverage preserves bounded highlight",
		);
		const density = [
			[0, 0],
			[0.4, 0],
			[0.5, 0],
			[1, 0],
		];
		const held = run(
			samples(() => 0.46),
			density,
			1,
			0.45,
			true,
		);
		assert(held.state[0] === 1, "small brightness change retains history");
		const escaped = run(
			samples(() => 0.65),
			density,
			1,
			0.45,
			true,
		);
		assert(
			escaped.state[0] === 2,
			"luminance escape hatch bypasses stale history",
		);
		const invalid = run(
			samples(() => 0.46),
			density,
			1,
			0.45,
			false,
		);
		assert(invalid.state[0] === 2, "reset history selects current best");
		const dark = run(
			samples(() => 0.005),
			density,
			3,
			0.9,
			true,
		);
		assert(
			dark.state[0] === 0 && dark.state[3] === 0,
			"dark cell blanks immediately",
		);
		const rejected = run(
			samples(() => 0.5),
			metrics,
			4,
			0.5,
			true,
		);
		assert(
			rejected.state[0] === 1,
			"ineligible previous directional glyph is replaced",
		);
		const priority = run(
			samples((x, y) => (y > 1 ? 0.9 : 0.1)),
			[
				[0, 0],
				[0.5, 0],
				[0.1, 1],
				[1, 0],
			],
		);
		assert(priority.state[0] === 1, "brightness fidelity outranks orientation");
		assert(
			horizontal.state[2] >= 127 && horizontal.state[2] <= 128,
			"occupancy uses samples above local threshold",
		);

		const compositeSource = ascii;
		const composite = gl.createProgram();
		gl.attachShader(
			composite,
			compile(
				gl.VERTEX_SHADER,
				"#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}",
			),
		);
		gl.attachShader(
			composite,
			compile(
				gl.FRAGMENT_SHADER,
				`#version 300 es
 precision highp float;precision highp int;
 uniform sampler2D iChannel0,iChannel1,iChannel2,uAsciiAnalysisColor,uAsciiAnalysisState;
 uniform vec3 iResolution,uShadowColor,uMidColor,uHighlightColor;
 uniform vec2 uAsciiCellSize;uniform int uGlyphCount,uPaletteMode;uniform float uAsciiMix;
 vec3 CompositeGlow(vec3 color,vec2 uv,vec3 source){return color;}
 ${compositeSource}
 out vec4 result;void main(){mainImage(result,gl_FragCoord.xy);}`,
			),
		);
		gl.linkProgram(composite);
		if (!gl.getProgramParameter(composite, gl.LINK_STATUS))
			throw Error(gl.getProgramInfoLog(composite));
		gl.useProgram(composite);
		const boundaryInputs = [
			texture(
				4,
				4,
				new Uint8Array(
					samples((x, y) => (y > 1 ? 1 : 0)).flatMap((v) => [
						v * 255,
						v * 255,
						v * 255,
						255,
					]),
				),
			),
			texture(1, 1, new Uint8Array([255, 255, 255, 255])),
			texture(1, 1, new Uint8Array([128, 255, 0, 255])),
			texture(1, 1, new Uint8Array([128, 128, 128, 128])),
			texture(1, 1, new Uint8Array([0, 255, 128, 255])),
		];
		[
			"iChannel0",
			"iChannel1",
			"iChannel2",
			"uAsciiAnalysisColor",
			"uAsciiAnalysisState",
		].forEach((name, i) => {
			gl.activeTexture(gl.TEXTURE0 + i);
			gl.bindTexture(gl.TEXTURE_2D, boundaryInputs[i]);
			gl.uniform1i(gl.getUniformLocation(composite, name), i);
		});
		gl.uniform3f(gl.getUniformLocation(composite, "iResolution"), 4, 4, 1);
		gl.uniform2f(gl.getUniformLocation(composite, "uAsciiCellSize"), 4, 4);
		gl.uniform1i(gl.getUniformLocation(composite, "uGlyphCount"), 1);
		gl.uniform1f(gl.getUniformLocation(composite, "uAsciiMix"), 1);
		const boundaryFramebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, boundaryFramebuffer);
		const boundaryOutput = texture(4, 4, null);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			boundaryOutput,
			0,
		);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
		// Texture creation disturbed the last unit; restore it before drawing.
		gl.activeTexture(gl.TEXTURE4);
		gl.bindTexture(gl.TEXTURE_2D, boundaryInputs[4]);
		gl.viewport(0, 0, 4, 4);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		const boundaryPixels = new Uint8Array(64);
		gl.readBuffer(gl.COLOR_ATTACHMENT0);
		gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, boundaryPixels);
		assert(
			boundaryPixels[0] === 0 && boundaryPixels[4 * 4 * 3] > 240,
			"subcell clipping preserves dark side and foreground emission without an outline",
		);
		const adapter = await navigator.gpu?.requestAdapter();
		if (!adapter) throw Error("WebGPU unavailable for parity checks");
		const device = await adapter.requestDevice();
		device.pushErrorScope("validation");
		const wgsl = analysisWgsl;
		const params = `struct Params {time_exposure_quality_glyph:vec4<f32>,shadow:vec4<f32>,mid:vec4<f32>,highlight:vec4<f32>,source_dims:vec4<f32>,canvas_dims:vec4<f32>,cell_size:vec4<f32>,camera_position:vec4<f32>,camera_right:vec4<f32>,camera_up:vec4<f32>,camera_forward:vec4<f32>};`;
		const pipeline = await device.createComputePipelineAsync({
			layout: "auto",
			compute: {
				module: device.createShaderModule({ code: params + wgsl }),
				entryPoint: "main",
			},
		});
		for (const c of cases) {
			const tex = (w, h, format, data) => {
				const t = device.createTexture({
					size: [w, h],
					format,
					usage: 4 | 8 | 2 | 1,
				});
				if (data)
					device.queue.writeTexture(
						{ texture: t },
						data,
						{ bytesPerRow: w * (format === "rgba32float" ? 16 : 4) },
						[w, h],
					);
				return t;
			};
			// Invert the backend's display transform so both shaders see identical inputs.
			const linear = new Float32Array(
				c.samples.flatMap((v) => {
					const q = Math.floor(v * 255) / 255;
					const p = Math.pow(Math.min(q, 0.9999), 1 / 0.72);
					const raw = p / (1 - p);
					return [raw, raw, raw, 1];
				}),
			);
			const input = tex(4, 4, "rgba32float", linear);
			const oldState = tex(
				1,
				1,
				"rgba8unorm",
				new Uint8Array([c.previous, 0, 0, 255]),
			);
			const metrics = tex(
				c.metrics.length,
				1,
				"rgba8unorm",
				new Uint8Array(
					c.metrics.flatMap((m) => [m[0] * 255, m[0] * 255, m[1], 255]),
				),
			);
			const oldColor = tex(
				1,
				1,
				"rgba8unorm",
				new Uint8Array([0, 0, 0, c.previousLum * 255]),
			);
			const color = tex(1, 1, "rgba8unorm"),
				state = tex(1, 1, "rgba8unorm");
			const uniforms = new Float32Array(44);
			uniforms[2] = 1;
			uniforms[3] = c.metrics.length;
			uniforms[19] = c.history ? 1 : 0;
			uniforms[20] = c.size[0];
			uniforms[21] = c.size[1];
			uniforms[23] = 1;
			uniforms[24] = c.size[0];
			uniforms[25] = c.size[1];
			const buffer = device.createBuffer({ size: 176, usage: 64 | 8 });
			device.queue.writeBuffer(buffer, 0, uniforms);
			const bind = device.createBindGroup({
				layout: pipeline.getBindGroupLayout(0),
				entries: [input, oldState, metrics, oldColor, color, state]
					.map((t, binding) => ({ binding, resource: t.createView() }))
					.concat([{ binding: 6, resource: { buffer } }]),
			});
			const read = device.createBuffer({ size: 512, usage: 1 | 8 });
			const encoder = device.createCommandEncoder();
			const pass = encoder.beginComputePass();
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, bind);
			pass.dispatchWorkgroups(1);
			pass.end();
			encoder.copyTextureToBuffer(
				{ texture: color },
				{ buffer: read, bytesPerRow: 256 },
				[1, 1],
			);
			encoder.copyTextureToBuffer(
				{ texture: state },
				{ buffer: read, offset: 256, bytesPerRow: 256 },
				[1, 1],
			);
			device.queue.submit([encoder.finish()]);
			await read.mapAsync(1);
			const pixels = new Uint8Array(read.getMappedRange());
			assert(
				c.result.color.every((v, i) => Math.abs(v - pixels[i]) <= 1) &&
					c.result.state.every((v, i) => Math.abs(v - pixels[256 + i]) <= 1),
				"WebGPU parity case " + cases.indexOf(c),
			);
			read.unmap();
			read.destroy();
			buffer.destroy();
			for (const t of [input, oldState, metrics, oldColor, color, state])
				t.destroy();
		}
		const error = await device.popErrorScope();
		if (error) throw Error(error.message);
		device.destroy();
		gl.getExtension("WEBGL_lose_context")?.loseContext();
		return { passed: checks.length, checks };
	});
}
