// Browser-only diagnostic readbacks: an 8x8 tile from every offscreen pass.
async (page) => {
	const browser = page.context().browser(),
		results = [];
	for (const context of browser.contexts())
		if (context !== page.context()) await context.close();
	for (const backend of ["webgl2", "webgpu"]) {
		const context = await browser.newContext({
				viewport: { width: 800, height: 600 },
			}),
			p = await context.newPage();
		await context.addInitScript(() => {
			let now = 1000,
				id = 0;
			const callbacks = new Map();
			window.requestAnimationFrame = (cb) => {
				callbacks.set(++id, cb);
				return id;
			};
			window.cancelAnimationFrame = (id) => callbacks.delete(id);
			performance.now = () => now;
			window.__step = () => {
				now += 1000 / 60;
				const queued = [...callbacks.values()];
				callbacks.clear();
				for (const cb of queued) cb(now);
			};
			window.__passes = {};
			window.__ready = 0;
			const source = WebGL2RenderingContext.prototype.shaderSource,
				attach = WebGL2RenderingContext.prototype.attachShader,
				use = WebGL2RenderingContext.prototype.useProgram,
				draw = WebGL2RenderingContext.prototype.drawArrays,
				location = WebGL2RenderingContext.prototype.getUniformLocation;
			const shaderNames = new WeakMap(),
				programNames = new WeakMap();
			let current;
			WebGL2RenderingContext.prototype.shaderSource = function (shader, code) {
				let name;
				if (code.includes("TraceRay(")) name = "a";
				else if (code.includes("candidateScore(")) name = "analysis";
				else if (code.includes("PaletteColor(")) name = "ascii";
				else if (code.includes("Grab1(")) name = "b";
				else if (code.includes("weights[5]"))
					name = /vec2\(0\.5,\s*0\.0\)/.test(code) ? "c" : "d";
				else if (code.includes("DisplayColor(")) name = "image";
				if (name) shaderNames.set(shader, name);
				return source.call(this, shader, code);
			};
			WebGL2RenderingContext.prototype.attachShader = function (
				program,
				shader,
			) {
				if (shaderNames.has(shader))
					programNames.set(program, shaderNames.get(shader));
				return attach.call(this, program, shader);
			};
			WebGL2RenderingContext.prototype.useProgram = function (program) {
				current = programNames.get(program);
				return use.call(this, program);
			};
			WebGL2RenderingContext.prototype.getUniformLocation = function (
				program,
				name,
			) {
				if (name === "uBloomStrength") window.__ready++;
				return location.call(this, program, name);
			};
			WebGL2RenderingContext.prototype.drawArrays = function (...args) {
				const result = draw.apply(this, args);
				if (current && current !== "ascii")
					window.__passes[current] = {
						gl: this,
						framebuffer: this.getParameter(this.FRAMEBUFFER_BINDING),
						size: [...this.getParameter(this.VIEWPORT)].slice(2),
					};
				return result;
			};
			if (typeof GPUAdapter !== "undefined") {
				const request = GPUAdapter.prototype.requestDevice;
				GPUAdapter.prototype.requestDevice = async function (...args) {
					const device = await request.apply(this, args);
					window.__gpuDevice = device;
					const views = new WeakMap(),
						pipelines = new WeakMap(),
						texture = device.createTexture.bind(device),
						pipeline = device.createRenderPipelineAsync.bind(device),
						encoder = device.createCommandEncoder.bind(device);
					device.createTexture = (descriptor) => {
						const t = texture(descriptor),
							view = t.createView.bind(t);
						t.createView = (...args) => {
							const v = view(...args);
							views.set(v, {
								texture: t,
								size: Array.from(descriptor.size),
								format: descriptor.format,
							});
							return v;
						};
						return t;
					};
					device.createRenderPipelineAsync = async (descriptor) => {
						const p = await pipeline(descriptor);
						pipelines.set(p, descriptor.label);
						window.__ready++;
						return p;
					};
					device.createCommandEncoder = (...args) => {
						const e = encoder(...args),
							begin = e.beginRenderPass.bind(e);
						e.beginRenderPass = (descriptor) => {
							const p = begin(descriptor),
								set = p.setPipeline.bind(p);
							p.setPipeline = (pipeline) => {
								const name = pipelines.get(pipeline);
								if (name && name !== "ascii" && name !== "present")
									window.__passes[name] = descriptor.colorAttachments.map((a) =>
										views.get(a.view),
									);
								return set(pipeline);
							};
							return p;
						};
						return e;
					};
					return device;
				};
			}
		});
		await p.route("**/_astro/*.js", async (route) => {
			const response = await route.fetch();
			let body = await response.text();
			if (route.request().url().includes("BlackHoleBackground."))
				body =
					`for(const host of document.querySelectorAll('[data-black-hole-background]'))host.dataset.settings=JSON.stringify({...JSON.parse(host.dataset.settings),backend:${JSON.stringify(backend)},debugStats:true});\n` +
					body;
			await route.fulfill({
				response,
				body:
					`await(globalThis.__fonts??=new FontFace('Departure Mono','url(/fonts/DepartureMono-Regular.woff2)').load().then(font=>document.fonts.add(font)));\n` +
					body,
			});
		});
		// WebGL uses the untouched pre-migration build; GPU uses the final candidate.
		await p.goto(`http://127.0.0.1:${backend === "webgl2" ? 4399 : 4322}/`, {
			waitUntil: "domcontentloaded",
		});
		await p.waitForFunction(
			(backend) => window.__ready >= (backend === "webgpu" ? 8 : 3),
			backend,
			{ polling: 50, timeout: 60000 },
		);
		await p.waitForTimeout(100);
		const passes = await p.evaluate(async (backend) => {
			for (let i = 0; i < 120; i++) {
				window.__step();
				if (backend === "webgpu")
					await window.__gpuDevice.queue.onSubmittedWorkDone();
				else {
					const gl = document.querySelector("canvas").getContext("webgl2");
					gl.readPixels(
						0,
						0,
						1,
						1,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						new Uint8Array(4),
					);
				}
			}
			const results = {};
			const half = (v) => {
				const sign = v & 32768 ? -1 : 1,
					exponent = (v >> 10) & 31,
					mantissa = v & 1023;
				return exponent === 0
					? sign * 2 ** -14 * (mantissa / 1024)
					: exponent === 31
						? null
						: sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
			};
			for (const [name, pass] of Object.entries(window.__passes)) {
				const outputs = [];
				if (backend === "webgpu")
					for (const target of pass) {
						const [width, height] = target.size,
							origin = [
								Math.max(0, Math.floor(width / 2) - 4),
								Math.max(0, Math.floor(height * 0.35) - 4),
							];
						const device = window.__gpuDevice,
							buffer = device.createBuffer({
								size: 256 * 8,
								usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
							}),
							encoder = device.createCommandEncoder();
						encoder.copyTextureToBuffer(
							{ texture: target.texture, origin },
							{ buffer, bytesPerRow: 256 },
							[8, 8],
						);
						device.queue.submit([encoder.finish()]);
						await buffer.mapAsync(GPUMapMode.READ);
						const values = [],
							bytes = buffer.getMappedRange(),
							floating = target.format === "rgba16float";
						for (let y = 0; y < 8; y++) {
							const row = floating
								? new Uint16Array(bytes, y * 256, 32)
								: new Uint8Array(bytes, y * 256, 32);
							for (const value of row)
								values.push(floating ? half(value) : value / 255);
						}
						buffer.unmap();
						buffer.destroy();
						outputs.push({ width, height, origin, values });
					}
				else {
					const {
							gl,
							framebuffer,
							size: [width, height],
						} = pass,
						origin = [
							Math.max(0, Math.floor(width / 2) - 4),
							Math.max(0, Math.floor(height * 0.35) - 4),
						];
					gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
					for (let i = 0; i < (name === "analysis" ? 2 : 1); i++) {
						gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
						const floating = name !== "analysis",
							values = floating ? new Float32Array(256) : new Uint8Array(256);
						gl.readPixels(
							...origin,
							8,
							8,
							gl.RGBA,
							floating ? gl.FLOAT : gl.UNSIGNED_BYTE,
							values,
						);
						outputs.push({
							width,
							height,
							origin,
							values: Array.from(values, (v) => (floating ? v : v / 255)),
						});
					}
				}
				results[name] = outputs;
			}
			return results;
		}, backend);
		results.push({ backend, passes });
		await context.close();
	}
	return results;
}
