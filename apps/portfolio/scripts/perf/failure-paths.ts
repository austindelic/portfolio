export default async (page: import("@playwright/test").Page) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  await page.addInitScript(() => {
    const scenario = new URLSearchParams(location.search).get("failure");
    const live: typeof window.__failureProbe = {
      programs: new Set(),
      shaders: new Set(),
      textures: new Set(),
      framebuffers: new Set(),
      draws: 0,
      failed: false,
    };
    window.__failureProbe = live;
    for (const [kind, key] of [
      ["Program", "programs"],
      ["Shader", "shaders"],
      ["Texture", "textures"],
      ["Framebuffer", "framebuffers"],
    ] as const) {
      const create = (
          WebGL2RenderingContext.prototype as unknown as Record<
            string,
            (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
          >
        )["create" + kind],
        remove = (
          WebGL2RenderingContext.prototype as unknown as Record<
            string,
            (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
          >
        )["delete" + kind];
      (
        WebGL2RenderingContext.prototype as unknown as Record<
          string,
          (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
        >
      )["create" + kind] = function (...args) {
        const value = create.apply(this, args);
        if (value) live[key].add(value);
        return value;
      };
      (
        WebGL2RenderingContext.prototype as unknown as Record<
          string,
          (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
        >
      )["delete" + kind] = function (value) {
        live[key].delete(value as WebGLProgram);
        return remove.call(this, value);
      };
    }
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      live.draws++;
      return draw.apply(this, args);
    };
    if (scenario === "allocation" || scenario === "bloom-allocation") {
      let pending = false;
      const image = WebGL2RenderingContext.prototype.texImage2D,
        error = WebGL2RenderingContext.prototype.getError;
      WebGL2RenderingContext.prototype.texImage2D = function (
        ...args: unknown[]
      ) {
        const result = Reflect.apply(image, this, args);
        if (
          !live.failed &&
          args.length === 9 &&
          typeof args[3] === "number" &&
          args[3] > 64 &&
          (scenario === "allocation" || window.__injectBloomFailure)
        ) {
          live.failed = true;
          pending = true;
        }
        return result;
      };
      WebGL2RenderingContext.prototype.getError = function () {
        if (pending) {
          pending = false;
          return this.OUT_OF_MEMORY;
        }
        return error.call(this);
      };
    }
    if (scenario === "compile" || scenario === "bloom-compile") {
      const source = WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource = function (shader, text) {
        if (
          !live.failed &&
          (scenario === "compile" || window.__injectBloomFailure)
        ) {
          live.failed = true;
          return source.call(
            this,
            shader,
            text + "\nTHIS_IS_AN_INJECTED_COMPILATION_ERROR",
          );
        }
        return source.call(this, shader, text);
      };
    }

    if (scenario === "unavailable") {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        if (type === "webgl2") {
          live.failed = true;
          return null;
        }
        return Reflect.apply(get, this, [type, ...args]) as
          | RenderingContext
          | GPUCanvasContext
          | null;
      } as typeof HTMLCanvasElement.prototype.getContext;
    }
  });
  const results = [];
  for (const scenario of [
    "allocation",
    "compile",
    "unavailable",
    "bloom-allocation",
    "bloom-compile",
  ] as const) {
    await page.goto(
      origin +
        (scenario.startsWith("bloom-")
          ? "/black-hole/?failure="
          : "/?failure=") +
        scenario,
      {
        waitUntil: "networkidle",
      },
    );
    if (scenario.startsWith("bloom-")) {
      await page.getByLabel("Bloom", { exact: true }).waitFor();
      await page.evaluate(() => {
        window.__injectBloomFailure = true;
      });
      await page.getByLabel("Bloom", { exact: true }).fill("0.4");
      await page.getByLabel("Bloom", { exact: true }).press("Tab");
    }
    await page.waitForTimeout(300);
    results.push(
      await page.evaluate((scenario) => {
        const p = window.__failureProbe;
        return {
          scenario,
          failed: p.failed,
          draws: p.draws,
          programs: p.programs.size,
          shaders: p.shaders.size,
          textures: p.textures.size,
          framebuffers: p.framebuffers.size,
          errorText:
            document.querySelector<HTMLElement>('[class*="border-red-500"]')!
              ?.textContent || null,
        };
      }, scenario),
    );
  }
  const failures = results.filter((r) => {
    if (!r.failed) return true;
    if (["allocation", "bloom-allocation"].includes(r.scenario)) {
      const bloom = r.scenario === "bloom-allocation";
      return (
        r.draws === 0 ||
        r.programs !== (bloom ? 6 : 3) ||
        r.textures !== (bloom ? 10 : 7) ||
        r.errorText
      );
    }
    return (
      r.programs !== 0 || r.shaders !== 0 || r.textures !== 0 || !r.errorText
    );
  });
  return { results, failures };
};
