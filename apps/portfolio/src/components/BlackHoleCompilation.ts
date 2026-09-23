/** Submit the whole batch before asking the driver for any completion status. */
export function submitPrograms(
	gl: WebGL2RenderingContext,
	sources: ReadonlyArray<{ name: string; vertex: string; fragment: string }>,
) {
	const extension = gl.getExtension("KHR_parallel_shader_compile");
	const pending: {
		name: string;
		program: WebGLProgram;
		shaders: WebGLShader[];
	}[] = [];
	let released = false;
	const cancel = () => {
		if (released) return;
		released = true;
		for (const item of pending) {
			for (const shader of item.shaders) gl.deleteShader(shader);
			gl.deleteProgram(item.program);
		}
	};
	try {
		for (const source of sources) {
			const program = gl.createProgram();
			if (!program) throw new Error(`Could not create ${source.name} program.`);
			const item = { name: source.name, program, shaders: [] as WebGLShader[] };
			pending.push(item);
			for (const [type, text] of [
				[gl.VERTEX_SHADER, source.vertex],
				[gl.FRAGMENT_SHADER, source.fragment],
			] as const) {
				const shader = gl.createShader(type);
				if (!shader) throw new Error(`Could not create ${source.name} shader.`);
				item.shaders.push(shader);
				gl.shaderSource(shader, text);
				gl.compileShader(shader);
				gl.attachShader(program, shader);
			}
			gl.linkProgram(program);
		}
	} catch (error) {
		cancel();
		throw error;
	}
	return {
		cancel,
		/** force is used only for unexpected editor changes that must affect this frame. */
		finish(force = false): WebGLProgram[] | null {
			if (released) return null;
			if (
				!force &&
				extension &&
				pending.some(
					(item) =>
						!gl.getProgramParameter(
							item.program,
							extension.COMPLETION_STATUS_KHR,
						),
				)
			)
				return null;
			try {
				for (const item of pending) {
					if (!gl.getProgramParameter(item.program, gl.LINK_STATUS)) {
						const diagnostics = item.shaders
							.map((shader) => gl.getShaderInfoLog(shader))
							.filter(Boolean)
							.join("\n");
						throw new Error(
							`${item.name} failed to link:\n${diagnostics || gl.getProgramInfoLog(item.program) || "Unknown program link error."}`,
						);
					}
				}
				for (const item of pending)
					for (const shader of item.shaders) gl.deleteShader(shader);
				released = true; // Ownership of the linked programs transfers to the caller.
				return pending.map((item) => item.program);
			} catch (error) {
				cancel();
				throw error;
			}
		},
	};
}
