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

    window.__realNow = performance.now.bind(performance);
    window.__draws = 0;
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      window.__draws++;
      return draw.apply(this, args);
    };
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

  const results = [];
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
        });
        await page.waitForSelector("canvas");
        await page.waitForFunction(() => window.__programsReady >= 3, null, {
          polling: 50,
        });
        await page.evaluate(() => document.fonts.ready);
        results.push(
          await page.evaluate(
            async ({ viewport, run, port }) => {
              console.info("BENCH_START", viewport.width, run, port);
              const gl = document
                .querySelector("canvas")!
                .getContext("webgl2")!;
              const warmPixel = new Uint8Array(4);
              for (let frame = 0; frame < 120; frame++) {
                window.__stepFrames(1);
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, warmPixel);
              }
              const pixel = new Uint8Array(4),
                before = window.__draws;
              const samples = [];
              for (let frame = 0; frame < 120; frame++) {
                const start = window.__realNow();
                window.__stepFrames(1);
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                samples.push(window.__realNow() - start);
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
              samples.sort((a, b) => a - b);
              console.info(
                "BENCH_DONE",
                viewport.width,
                run,
                port,
                samples[60],
              );
              if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR)
                throw new Error("Invalid GPU sample: context lost or GL error");
              if (window.__draws <= before)
                throw new Error("No shader frames measured");
              return {
                viewport,
                port,
                run,
                draws: window.__draws - before,
                median: samples[60],
                p95: samples[114],
                mean: samples.reduce((a, b) => a + b, 0) / samples.length,
                method:
                  "synchronous frame plus 1-pixel readback, includes driver overhead",
              };
            },
            { viewport, run, port },
          ),
        );
      }
    }
  }
  return { label, results };
};
