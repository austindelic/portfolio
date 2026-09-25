// Run with Playwright CLI against the candidate preview; ?matrix=smoke limits cases.
// All instrumentation is browser-injected. Production exports are unchanged.
export default async (page: import("@playwright/test").Page) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  const rendered = page.url().includes("matrix=rendered");
  const smoke = page.url().includes("matrix=smoke");
  const fixes = page.url().includes("matrix=fixes");
  const routesOnly = page.url().includes("matrix=routes");
  const browser = page.context().browser()!;
  const cases = smoke
    ? [
        {
          name: "home",
          width: 390,
          height: 844,
          dpr: 1,
          props: {},
          frames: [30, 120, 420],
        },
      ]
    : [
        ...[
          { width: 1440, height: 900, dpr: 1 },
          { width: 2560, height: 1440, dpr: 1 },
          { width: 390, height: 844, dpr: 1 },
          { width: 1440, height: 900, dpr: 2 },
        ].map((v) => ({
          name: "home",
          ...v,
          props: {},
          frames: [1, 30, 60, 120, 420],
        })),
        ...[
          { name: "no-bloom", bloomStrength: 0 },
          { name: "no-ascii", asciiEnabled: false },
          { name: "mixed", asciiMix: 0.4 },
          {
            name: "custom-glyphs",
            glyphPreset: "custom",
            customGlyphs: " .:-=+*#%@",
            fontFamily: "Menlo",
          },
          {
            name: "custom-palette",
            paletteMode: "custom",
            shadowColor: "#031525",
            midColor: "#23bccd",
            highlightColor: "#ffbd80",
            brightness: 0.1,
            contrast: 1.3,
          },
          { name: "jitter", temporalJitter: 0.2 },
          { name: "antiverse", initialUniverseSign: -1 },
          { name: "cell-grid", rendererMode: "ascii-cell" },
          ...[
            "mobile-safe",
            "ascii-balanced",
            "ascii-sharp",
            "performance",
            "balanced",
            "visual",
            "desktop-full",
            "stress-test",
          ].map((quality) => ({ name: quality, quality })),
        ].map(({ name, ...props }) => ({
          name,
          width: 800,
          height: 600,
          dpr: 1,
          props: {
            animationMode: "off",
            initialCameraPosition: [11.256, 2.652, 18.44],
            initialCameraForward: [-0.5171, -0.1219, -0.8472],
            ...props,
          },
          frames: [120],
        })),
      ];
  cases.push({
    name: "navigation",
    width: 1440,
    height: 900,
    dpr: 1,
    props: {},
    frames: [420],
  });
  const results = [],
    errors: Record<string, unknown>[] = [];
  for (const scenario of cases.filter(
    (x) =>
      (!rendered || ["home", "no-bloom"].includes(x.name)) &&
      (!routesOnly || x.name === "navigation") &&
      (!smoke || x.name !== "navigation") &&
      (!fixes ||
        ["antiverse", "ascii-balanced", "ascii-sharp", "cell-grid"].includes(
          x.name,
        )),
  ))
    for (const backend of origin.includes(":4399")
      ? ["webgl2"]
      : ["webgl2", "webgpu"]) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor: scenario.dpr,
      });
      await context.addInitScript(() => {
        let now = 1000,
          id = 0;
        const callbacks = new Map<number, FrameRequestCallback>();
        window.requestAnimationFrame = (cb) => {
          callbacks.set(++id, cb);
          return id;
        };
        window.cancelAnimationFrame = (id) => callbacks.delete(id);
        performance.now = () => now;
        window.__stepFrames = (count: number) => {
          for (let i = 0; i < count; i++) {
            now += 1000 / 60;
            const queued = [...callbacks.values()];
            callbacks.clear();
            for (const cb of queued) cb(now);
          }
        };
        window.__shaderFrame = -1;
        const frameLocations = new WeakSet(),
          timeLocations = new WeakSet();
        const intUniform = WebGL2RenderingContext.prototype.uniform1i,
          floatUniform = WebGL2RenderingContext.prototype.uniform1f;
        WebGL2RenderingContext.prototype.uniform1i = function (
          location,
          value,
        ) {
          if (location && frameLocations.has(location))
            window.__shaderFrame = value;
          return intUniform.call(this, location, value);
        };
        WebGL2RenderingContext.prototype.uniform1f = function (
          location,
          value,
        ) {
          if (location && timeLocations.has(location))
            window.__shaderTime = value;
          return floatUniform.call(this, location, value);
        };
        window.__programsReady = 0;
        window.__pipelinesReady = 0;
        const original = WebGL2RenderingContext.prototype.getUniformLocation;
        WebGL2RenderingContext.prototype.getUniformLocation = function (p, n) {
          const result = original.call(this, p, n);
          if (result && n === "iFrame") frameLocations.add(result);
          if (result && n === "iTime") timeLocations.add(result);
          if (n === "uBloomStrength") window.__programsReady++;
          return result;
        };
        if (typeof GPUAdapter !== "undefined") {
          const request = GPUAdapter.prototype.requestDevice;
          GPUAdapter.prototype.requestDevice = async function (...args) {
            const device = await request.apply(this, args);
            window.__gpuDevice = device;
            const write = device.queue.writeBuffer.bind(device.queue);
            device.queue.writeBuffer = (buffer, offset, data, ...args) => {
              if (data instanceof Float32Array && data.length === 160) {
                window.__shaderFrame = data[12];
                window.__shaderTime = data[4];
              }
              write(buffer, offset, data, ...args);
              return undefined;
            };
            const pipeline = device.createRenderPipelineAsync.bind(device);
            device.createRenderPipelineAsync = async (...args) => {
              const result = await pipeline(...args);
              window.__pipelinesReady++;
              return result;
            };
            return device;
          };
        }
        const NativeDate = Date;
        window.Date = new Proxy(NativeDate, {
          construct(target, args) {
            return Reflect.construct(
              target,
              args.length ? args : ["2026-09-22T12:00:00Z"],
            );
          },
          get(target, key) {
            return key === "now"
              ? () => 1790078400000
              : Reflect.get(target, key);
          },
        });
      });
      const p = await context.newPage();
      p.on("pageerror", (e) =>
        errors.push({
          scenario: rendered ? `rendered-${scenario.name}` : scenario.name,
          backend,
          error: e.message,
        }),
      );
      p.on("console", (m) => {
        if (m.type() === "error")
          errors.push({ scenario: scenario.name, backend, error: m.text() });
      });
      p.on("requestfailed", (r) =>
        errors.push({
          scenario: scenario.name,
          backend,
          request: r.url(),
          error: r.failure(),
        }),
      );
      await p.route("**/_astro/*.js", async (route) => {
        const response = await route.fetch();
        let source = await response.text();
        const prelude = `await (globalThis.__captureFonts??=Promise.all([['Departure Mono','/fonts/DepartureMono-Regular.woff2'],['DSEG14Modern','/fonts/DSEG14Modern-Regular.woff2']].map(async([family,url])=>{const font=await new FontFace(family,'url('+url+')').load();document.fonts.add(font);})));\n`;
        if (route.request().url().includes("BlackHoleBackground."))
          source =
            `for(const host of document.querySelectorAll('[data-black-hole-background]'))host.dataset.settings=JSON.stringify({...JSON.parse(host.dataset.settings),...${JSON.stringify(scenario.props)},backend:${JSON.stringify(backend)},debugStats:true});\n` +
            source;
        await route.fulfill({ response, body: prelude + source });
      });
      await p.goto(origin + "/", { waitUntil: "domcontentloaded" });
      await p.waitForFunction(
        ({ backend, count }) =>
          backend === "webgpu"
            ? window.__pipelinesReady >= count
            : window.__programsReady >= 3,
        {
          backend,
          count:
            (scenario.props as { bloomStrength?: number }).bloomStrength === 0
              ? 5
              : 8,
        },
        { polling: 50, timeout: 60000 },
      );
      await p.waitForTimeout(150);
      let previous = 0;
      for (const target of scenario.frames) {
        await p.evaluate(
          async ({ count, backend, rendered, target }) => {
            while (
              rendered ? (window.__shaderFrame ?? -1) < target : count > 0
            ) {
              const n = rendered
                ? Math.max(
                    1,
                    Math.min(20, target - (window.__shaderFrame ?? -1)),
                  )
                : Math.min(count, 20);
              window.__stepFrames(n);
              count -= n;
              if (backend === "webgpu")
                await window.__gpuDevice.queue.onSubmittedWorkDone();
              else {
                const gl = document
                  .querySelector("canvas")!
                  .getContext("webgl2")!;
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
          },
          { count: target - previous, backend, rendered, target },
        );
        previous = target;
        await p.waitForTimeout(100);
        const filename = `.playwright-cli/${origin.includes(":4399") ? "reference" : "parity"}-${rendered ? "rendered-" : ""}${scenario.name}-${scenario.width}-dpr${scenario.dpr}-${backend}-${target}.png`;
        await p.locator("canvas").screenshot({
          path: filename,
          style:
            "body * {visibility:hidden !important} canvas {visibility:visible !important}",
        });
        results.push({
          scenario: rendered ? `rendered-${scenario.name}` : scenario.name,
          width: scenario.width,
          height: scenario.height,
          dpr: scenario.dpr,
          backend,
          target,
          filename,
          stats: await p.evaluate(
            (rendered) =>
              rendered
                ? {
                    ...window.__blackHoleStats!,
                    frame: window.__shaderFrame,
                    shaderTime: Math.fround(window.__shaderTime),
                  }
                : window.__blackHoleStats!,
            rendered,
          ),
        });
      }
      if (scenario.name === "navigation")
        for (const [path, name] of [
          ["/blog/", "blog"],
          ["/blog/site-and-terminal/", "post"],
          ["/socials/", "socials"],
          ["/", "home"],
        ]) {
          await p.evaluate((path: string) => {
            const a = document.createElement("a");
            a.id = "parity-navigation";
            a.href = path;
            a.textContent = "Navigate";
            a.style.cssText = "position:fixed;top:0;left:0;z-index:999999";
            document.body.append(a);
          }, path);
          await p.locator("#parity-navigation").click();
          await p.waitForTimeout(500);
          await p.evaluate(async (backend: string) => {
            for (let i = 0; i < 6; i++) {
              window.__stepFrames(20);
              if (backend === "webgpu")
                await window.__gpuDevice.queue.onSubmittedWorkDone();
              else {
                const gl = document
                  .querySelector("canvas")!
                  .getContext("webgl2")!;
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
          }, backend);
          await p.waitForTimeout(100);
          const filename = `.playwright-cli/parity-navigation-${name}-${backend}.png`;
          await p.locator("canvas").screenshot({
            path: filename,
            style:
              "body * {visibility:hidden !important} canvas {visibility:visible !important}",
          });
          results.push({
            scenario: "navigation-" + name,
            width: scenario.width,
            height: scenario.height,
            dpr: scenario.dpr,
            backend,
            target: 120,
            filename,
            stats: await p.evaluate(() => window.__blackHoleStats!),
          });
        }
      await context.close();
    }
  return { results, errors };
};
