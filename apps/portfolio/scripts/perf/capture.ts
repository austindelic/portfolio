// Deterministic rAF clock; no production hooks or altered quality settings.
export default async (page: import("@playwright/test").Page) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  const label = page.url().split("perfRun=")[1]?.split("&")[0] || "baseline";
  await page.addInitScript(() => {
    window.__programsReady = 0;
    const readyLocation = WebGL2RenderingContext.prototype.getUniformLocation;
    WebGL2RenderingContext.prototype.getUniformLocation = function (
      program,
      name,
    ) {
      const result = readyLocation.call(this, program, name);
      if (name === "uBloomStrength") window.__programsReady++;
      return result;
    };

    window.__captureUniforms = {};
    const names = new WeakMap<WebGLUniformLocation, string>(),
      loc = WebGL2RenderingContext.prototype.getUniformLocation;
    WebGL2RenderingContext.prototype.getUniformLocation = function (p, n) {
      const l = loc.call(this, p, n);
      if (l) names.set(l, n);
      return l;
    };
    for (const name of ["uniform1f", "uniform1i", "uniform3fv"]) {
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
      )[name] = function (l: unknown, v: unknown) {
        window.__captureUniforms[names.get(l as object)!] =
          typeof v === "number" ? v : Array.from(v as ArrayLike<number>);
        return original.call(this, l, v);
      };
    }

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
        for (const callback of queued) callback(now);
      }
    };
    const NativeDate = Date;
    window.Date = new Proxy(NativeDate, {
      construct(target, args) {
        return Reflect.construct(
          target,
          args.length ? args : ["2026-09-22T12:00:00Z"],
        );
      },
      get(target, key) {
        return key === "now" ? () => 1790078400000 : Reflect.get(target, key);
      },
    });
  });
  // Block client entrypoints until web fonts are loaded, on both builds.
  await page.route("**/_astro/*.js", async (route) => {
    const response = await route.fetch();
    // Load fonts inside the module: evaluating the navigating document from
    // a paused module request can deadlock document readiness.
    const prelude = `await (globalThis.__captureFonts ??= Promise.all([
          ["Departure Mono", "/fonts/DepartureMono-Regular.woff2"],
          ["DSEG14Modern", "/fonts/DSEG14Modern-Regular.woff2"]
        ].map(async ([family, url]) => {
          const font = await new FontFace(family, "url(" + url + ")").load();
          document.fonts.add(font);
        })));\n`;
    await route.fulfill({ response, body: prelude + (await response.text()) });
  });
  const errors: string[] = [],
    checkpoints = [];
  page.on("pageerror", (e: { message: string }) => errors.push(e.message));
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 2560, height: 1440 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas");
    await page.waitForFunction(() => window.__programsReady >= 3, null, {
      polling: 50,
    });
    let previousFrame = 0;
    for (const target of [30, 60, 120, 420, 900, 1500, 2100, 2400]) {
      await page.evaluate((n: number) => {
        const gl = document.querySelector("canvas")!.getContext("webgl2")!;
        const pixel = new Uint8Array(4);
        while (n > 0) {
          const count = Math.min(n, 60);
          window.__stepFrames(count);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          n -= count;
        }
      }, target - previousFrame);
      previousFrame = target;
      // The compositor can lag GPU submission after a synthetic RAF burst.
      // Complete GPU work and allow presentation without advancing shader time.
      await page.evaluate(() => {
        const gl = document.querySelector("canvas")!.getContext("webgl2")!;
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      });
      await page.waitForTimeout(100);

      checkpoints.push({
        viewport,
        target,
        uniforms: await page.evaluate(() => window.__captureUniforms),
      });
      await page.screenshot({
        path:
          ".playwright-cli/" +
          label +
          "-" +
          viewport.width +
          "-" +
          target +
          ".png",
      });
      await page.locator("canvas").screenshot({
        path:
          ".playwright-cli/" +
          label +
          "-" +
          viewport.width +
          "-" +
          target +
          "-canvas.png",
      });
    }
  }
  return { label, errors, checkpoints };
};
