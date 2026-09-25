declare const window: Window & {
  __passes: {
    supported: boolean;
    discarded: number;
    timings: number[][];
    renderer: string | null;
  };
};
// Test-only instrumentation: no timer queries or readback in the shipped runtime.
export default async (page: import("@playwright/test").Page) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  await page.addInitScript(() => {
    const probe: typeof window.__passes = {
      supported: false,
      discarded: 0,
      timings: [[], [], []],
      renderer: null,
    };
    window.__passes = probe;
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    let index = 0,
      pending: { query: WebGLQuery; pass: number }[] = [],
      extension:
        | { GPU_DISJOINT_EXT: number; TIME_ELAPSED_EXT: number }
        | undefined;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      if (extension === undefined) {
        extension = this.getExtension("EXT_disjoint_timer_query_webgl2")!;
        probe.supported = !!extension;
        const info = this.getExtension("WEBGL_debug_renderer_info")!;
        probe.renderer = info
          ? this.getParameter(info.UNMASKED_RENDERER_WEBGL)
          : this.getParameter(this.RENDERER);
      }
      const pass = index++ % 3;
      if (!extension) return draw.apply(this, args);
      const disjoint = this.getParameter(extension.GPU_DISJOINT_EXT);
      pending = pending.filter((item) => {
        if (disjoint) {
          this.deleteQuery(item.query);
          probe.discarded++;
          return false;
        }
        if (!this.getQueryParameter(item.query, this.QUERY_RESULT_AVAILABLE))
          return true;
        const ms = this.getQueryParameter(item.query, this.QUERY_RESULT) / 1e6;
        if (ms > 0 && Number.isFinite(ms)) probe.timings[item.pass].push(ms);
        else probe.discarded++;
        this.deleteQuery(item.query);
        return false;
      });
      if (pending.length > 60) return draw.apply(this, args);
      const query = this.createQuery();
      this.beginQuery(extension.TIME_ELAPSED_EXT, query);
      const result = draw.apply(this, args);
      this.endQuery(extension.TIME_ELAPSED_EXT);
      pending.push({ query, pass });
      return result;
    };
  });
  const results = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 2560, height: 1440 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(3500);
    results.push(
      await page.evaluate(
        (viewport) => ({ viewport, ...window.__passes }),
        viewport,
      ),
    );
  }
  return results;
};
