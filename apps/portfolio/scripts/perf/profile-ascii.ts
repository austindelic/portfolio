// Isolated diagnostic throughput; acceptance still uses complete uninstrumented frames.
export default async (page: import("@playwright/test").Page) => {
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

    let id = 0,
      now = 1000;
    const callbacks = new Map<number, FrameRequestCallback>();
    window.__realNow = performance.now.bind(performance);
    window.requestAnimationFrame = (callback) => {
      callbacks.set(++id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => callbacks.delete(id);
    performance.now = () => now;
    window.__stepFrames = (count: number) => {
      for (let i = 0; i < count; i++) {
        now += 1000 / 60;
        const batch = [...callbacks.values()];
        callbacks.clear();
        batch.forEach((callback) => {
          callback(now);
        });
      }
    };
  });
  const results = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 2560, height: 1440 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const port of [4400, 4401]) {
      await page.goto(`http://127.0.0.1:${port}/`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector("canvas");
      await page.waitForFunction(() => window.__programsReady >= 3, null, {
        polling: 50,
      });
      results.push(
        await page.evaluate(
          ({ viewport, port }) => {
            const gl = document.querySelector("canvas")!.getContext("webgl2")!,
              pixel = new Uint8Array(4);
            for (let i = 0; i < 120; i++) {
              window.__stepFrames(1);
              gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            }
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            if (
              !program ||
              !gl.getUniformLocation(program, "uGlyphCount") ||
              gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null
            )
              throw new Error("Expected final ASCII pass state");
            const samples = [];
            for (let block = 0; block < 5; block++) {
              const start = window.__realNow();
              for (let draw = 0; draw < 100; draw++)
                gl.drawArrays(gl.TRIANGLES, 0, 3);
              gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
              samples.push((window.__realNow() - start) / 100);
            }
            if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR)
              throw new Error("Invalid GL diagnostic");
            return {
              viewport,
              port,
              samples,
              method:
                "100 repeated ASCII draws plus one readback per block; diagnostic GPU/driver throughput",
            };
          },
          { viewport, port },
        ),
      );
    }
  }
  return { results };
};
