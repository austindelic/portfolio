// Run with Playwright CLI run-code --filename after opening /?perfRun=baseline.
export default async (page: import("@playwright/test").Page) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  const label = page.url().split("perfRun=")[1]?.split("&")[0] || "baseline";
  await page.addInitScript(() => {
    const probe: typeof window.__perfProbe = {
      frames: [],
      gpu: [],
      calls: {},
      resources: {},
      firstFrame: null,
      firstGpuCompletedFrame: null,
      firstPresentationOpportunity: null,
      compilationBlockingMs: 0,
      startupLongTasks: [],
      gl: null,
      uniforms: {},
      longTasks: [],
    };
    window.__perfProbe = probe;
    for (const name of [
      "compileShader",
      "linkProgram",
      "getProgramParameter",
      "getShaderParameter",
    ]) {
      const original = (
        WebGL2RenderingContext.prototype as unknown as Record<
          string,
          (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
        >
      )[name];
      (
        WebGL2RenderingContext.prototype as unknown as Record<
          string,
          (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
        >
      )[name] = function (...args) {
        const start = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          probe.compilationBlockingMs! += performance.now() - start;
        }
      };
    }
    const live = new Map();
    for (const kind of [
      "Texture",
      "Framebuffer",
      "Program",
      "Buffer",
      "VertexArray",
    ]) {
      const items = new Set();
      live.set(kind, items);
      for (const action of ["create", "delete"]) {
        const name = action + kind,
          original = (
            WebGL2RenderingContext.prototype as unknown as Record<
              string,
              (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
            >
          )[name];
        (
          WebGL2RenderingContext.prototype as unknown as Record<
            string,
            (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
          >
        )[name] = function (...args: unknown[]) {
          const result = original.apply(this, args);
          if (action === "create" && result) items.add(result);
          else if (action === "delete") items.delete(args[0]);
          probe.resources[kind] = items.size;
          return result;
        };
      }
    }
    const names = new WeakMap<WebGLUniformLocation, string>();
    const location = WebGL2RenderingContext.prototype.getUniformLocation;
    WebGL2RenderingContext.prototype.getUniformLocation = function (
      program,
      name,
    ) {
      const value = location.call(this, program, name);
      if (value) names.set(value, name);
      return value;
    };
    for (const name of [
      "drawArrays",
      "drawBuffers",
      "vertexAttribPointer",
      "bindTexture",
      "uniform1f",
      "uniform1i",
      "uniform2f",
      "uniform3f",
      "uniform3fv",
    ]) {
      const original = (
        WebGL2RenderingContext.prototype as unknown as Record<
          string,
          (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
        >
      )[name];
      (
        WebGL2RenderingContext.prototype as unknown as Record<
          string,
          (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
        >
      )[name] = function (...args) {
        probe.calls[name] = (probe.calls[name] || 0) + 1;
        if (name.startsWith("uniform"))
          probe.uniforms[names.get(args[0] as object)!] = args
            .slice(1)
            .map((v) =>
              ArrayBuffer.isView(v)
                ? Array.from(v as unknown as ArrayLike<number>)
                : (v as number),
            );
        return original.apply(this, args);
      };
    }
    const rect = HTMLCanvasElement.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      probe.calls.layoutReads = (probe.calls.layoutReads || 0) + 1;
      return rect.call(this);
    };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: [string, unknown?]
    ) {
      const gl = Reflect.apply(getContext, this, args) as
        | RenderingContext
        | GPUCanvasContext
        | null;
      if (args[0] === "webgl2" && gl) probe.gl = gl as WebGL2RenderingContext;
      return gl;
    } as typeof HTMLCanvasElement.prototype.getContext;
    const raf = window.requestAnimationFrame.bind(window);
    let previous = 0;
    const queries = [];
    window.requestAnimationFrame = (callback) =>
      raf((now) => {
        const gl = probe.gl!;
        const before = probe.calls.drawArrays || 0,
          start = performance.now();
        callback(now);
        const cpu = performance.now() - start;
        if ((probe.calls.drawArrays || 0) > before) {
          if (probe.firstFrame === null) {
            probe.firstFrame = performance.now();
            gl.readPixels(
              0,
              0,
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              new Uint8Array(4),
            );
            probe.firstGpuCompletedFrame = performance.now();
            raf(() =>
              raf(() => {
                probe.firstPresentationOpportunity = performance.now();
              }),
            );
          }
          probe.frames.push({
            cpu,
            wall: previous ? now - previous : 0,
            draws: probe.calls.drawArrays - before,
          });
          previous = now;
        }
      });
    new PerformanceObserver((list) =>
      probe.longTasks.push(...list.getEntries().map((e) => e.duration)),
    ).observe({ type: "longtask", buffered: true });
  });
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  const results = [];
  const errors: string[] = [];
  page.on("pageerror", (e: { message: string }) => errors.push(e.message));
  page.on("requestfailed", (r) =>
    errors.push(r.url() + ": " + r.failure()?.errorText),
  );
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 2560, height: 1440 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (let run = 0; run < 5; run++) {
      for (const port of run % 2 ? [4401, 4400] : [4400, 4401]) {
        await page.goto(`http://127.0.0.1:${port}/`, {
          waitUntil: "domcontentloaded",
          timeout: 120000,
        });
        await page.waitForFunction(
          () => window.__perfProbe.firstFrame !== null,
          null,
          { polling: 50, timeout: 120000 },
        );
        await page.evaluate(
          ({ port, run, viewport }) =>
            console.info("PUBLIC_START", port, run, viewport.width),
          { port, run, viewport },
        );
        await page.waitForTimeout(5500);
        await page.evaluate(() => {
          window.__perfProbe.frames = [];
          window.__perfProbe.gpu = [];
          window.__perfProbe.calls = {};
          window.__perfProbe.startupLongTasks = window.__perfProbe.longTasks;
          window.__perfProbe.longTasks = [];
        });
        await page.waitForTimeout(3000);
        results.push(
          await page.evaluate(
            ({ viewport, run, port }) => {
              const p = window.__perfProbe,
                gl = p.gl!,
                ext = gl.getExtension("WEBGL_debug_renderer_info")!;
              const quantile = (a: number[], q: number) =>
                a.length
                  ? [...a].sort((a, b) => a - b)[
                      Math.min(a.length - 1, Math.floor(a.length * q))
                    ]
                  : null;
              const cpu = p.frames.map((f) => f.cpu),
                wall = p.frames.map((f) => f.wall),
                js = (
                  performance.getEntriesByType(
                    "resource",
                  ) as PerformanceResourceTiming[]
                ).filter((r) => /\.js(?:\?|$)/.test(r.name));
              return {
                viewport,
                port,
                run,
                userAgent: navigator.userAgent,
                dpr: devicePixelRatio,
                gpu: ext
                  ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
                  : gl.getParameter(gl.RENDERER),
                frames: cpu.length,
                cpuMedian: quantile(cpu, 0.5),
                cpuP95: quantile(cpu, 0.95),
                wallMedian: quantile(wall, 0.5),
                wallP95: quantile(wall, 0.95),
                gpuMedian: quantile(p.gpu, 0.5),
                gpuP95: quantile(p.gpu, 0.95),
                droppedFrames: wall.filter((v: number) => v > 25).length,
                drawsPerFrame:
                  p.frames.reduce((n, f) => n + f.draws, 0) / cpu.length,
                calls: p.calls,
                resources: p.resources,
                firstFrame: p.firstFrame,
                firstGpuCompletedFrame: p.firstGpuCompletedFrame,
                firstPresentationOpportunity: p.firstPresentationOpportunity,
                compilationBlockingMs: p.compilationBlockingMs,
                startupLongTasks: p.startupLongTasks,
                jsBytes: js.reduce((n, r) => n + r.decodedBodySize, 0),
                js: js.map((r) => ({ url: r.name, bytes: r.decodedBodySize })),
                uniforms: p.uniforms,
                longTasks: p.longTasks,
              };
            },
            { viewport, run, port },
          ),
        );
        console.log(JSON.stringify({ sample: results[results.length - 1] }));
      }
    }
  }
  await client.detach();
  return { label, results, errors };
};
