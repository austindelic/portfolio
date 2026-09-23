async (page) => {
	await page.addInitScript(() => {
		// This exact-camera harness intercepts WebGL uniforms; route flows also test Auto/WebGPU.
		Object.defineProperty(navigator, "gpu", {
			configurable: true,
			value: undefined,
		});
		let now = 1000,
			id = 0;
		const callbacks = new Map();
		performance.now = () => now;
		window.requestAnimationFrame = (cb) => {
			callbacks.set(++id, cb);
			return id;
		};
		window.cancelAnimationFrame = (id) => callbacks.delete(id);
		window.step = (ms = 1000 / 60) => {
			now += ms;
			const queued = [...callbacks.values()];
			callbacks.clear();
			for (const cb of queued) cb(now);
		};
		window.queued = () => callbacks.size;
		window.cameraUniforms = {};
		const locations = new WeakMap(),
			get = WebGL2RenderingContext.prototype.getUniformLocation,
			set = WebGL2RenderingContext.prototype.uniform3fv;
		WebGL2RenderingContext.prototype.getUniformLocation = function (p, n) {
			const l = get.call(this, p, n);
			if (l) locations.set(l, n);
			return l;
		};
		WebGL2RenderingContext.prototype.uniform3fv = function (l, v) {
			const name = locations.get(l);
			if (name?.startsWith("uCamera"))
				window.cameraUniforms[name] = Array.from(v);
			return set.call(this, l, v);
		};
	});
	await page.setViewportSize({ width: 960, height: 600 });
	await page.goto(page.url().split("/").slice(0, 3).join("/") + "/");
	await page.waitForFunction(() => window.queued?.() > 0, null, {
		polling: 100,
	});
	await page.evaluate(() => window.step());
	const checks = [];
	let frame = 0;
	for (const count of [0, 60, 150, 240, 300]) {
		while (frame < count) {
			const batch = Math.min(20, count - frame);
			await page.evaluate((n) => {
				for (let i = 0; i < n; i++) window.step();
			}, batch);
			frame += batch;
		}
		const actual = await page.evaluate(() => window.cameraUniforms);
		const t = count / 300,
			e = t * t * t * (t * (t * 6 - 15) + 10),
			p0 = [0.95, 0.009, 0.588],
			p1 = [8.613, 3.1586, 21.229],
			f0 = [0.847, 0.037, 0.53],
			f1 = [-0.2752, -0.0919, -0.957];
		const expected = p0.map((v, i) => v + (p1[i] - v) * e),
			f = f0.map((v, i) => v + (f1[i] - v) * e),
			len = Math.hypot(...f);
		const right = actual.uCameraRight,
			up = actual.uCameraUp;
		const forward = [
			-(right[1] * up[2] - right[2] * up[1]),
			-(right[2] * up[0] - right[0] * up[2]),
			-(right[0] * up[1] - right[1] * up[0]),
		];
		const positionError = Math.hypot(
				...expected.map((v, i) => v - actual.uCameraPosition[i]),
			),
			directionError = Math.hypot(...f.map((v, i) => v / len - forward[i]));
		if (positionError > 1e-5 || directionError > 1e-5)
			throw new Error(
				JSON.stringify({ count, positionError, directionError, actual }),
			);
		checks.push({ seconds: count / 60, positionError, directionError });
		await page.screenshot({ path: `/tmp/original-intro-${count}.png` });
	}
	return { passed: true, checks };
}
