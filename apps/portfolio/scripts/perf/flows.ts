// Run against the production preview in a fresh Playwright CLI session.
export default async (page: import("@playwright/test").Page) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  const failures: (string | Record<string, unknown>)[] = [],
    consoleErrors: string[] = [],
    badRequests: { url: string; status: number }[] = [];
  page.on("pageerror", (error: { message: string }) =>
    consoleErrors.push(error.message),
  );
  page.on("console", (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      badRequests.push({ url: response.url(), status: response.status() });
  });
  await page.addInitScript(() => {
    const state: typeof window.__lifecycle = {
      programs: new Set(),
      textures: new Set(),
      contexts: 0,
      draws: 0,
      canvas: null,
    };
    window.__lifecycle = state;
    for (const [name, set] of [
      ["Program", state.programs],
      ["Texture", state.textures],
    ] as const) {
      const create = (
          WebGL2RenderingContext.prototype as unknown as Record<
            string,
            (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
          >
        )["create" + name],
        remove = (
          WebGL2RenderingContext.prototype as unknown as Record<
            string,
            (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
          >
        )["delete" + name];
      (
        WebGL2RenderingContext.prototype as unknown as Record<
          string,
          (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
        >
      )["create" + name] = function (...args) {
        const value = create.apply(this, args);
        if (value) set.add(value);
        return value;
      };
      (
        WebGL2RenderingContext.prototype as unknown as Record<
          string,
          (this: WebGL2RenderingContext, ...args: unknown[]) => unknown
        >
      )["delete" + name] = function (value) {
        set.delete(value as WebGLProgram);
        return remove.call(this, value);
      };
    }
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      state.draws++;
      return draw.apply(this, args);
    };
    const get = HTMLCanvasElement.prototype.getContext,
      seen = new WeakSet();
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: [string, unknown?]
    ) {
      const value = Reflect.apply(get, this, args) as
        | RenderingContext
        | GPUCanvasContext
        | null;
      if (args[0] === "webgl2" && value && !seen.has(value)) {
        seen.add(value);
        state.contexts++;
      }
      return value;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const snapshot = () =>
    page.evaluate(() => ({
      programs: window.__lifecycle.programs.size,
      textures: window.__lifecycle.textures.size,
      contexts: window.__lifecycle.contexts,
      draws: window.__lifecycle.draws,
      canvases: document.querySelectorAll("canvas").length,
      clock: document.querySelector<HTMLElement>("#perth-time")!?.textContent,
    }));
  const navigate = async (path: string) => {
    await page.evaluate((path: string) => {
      const link = document.createElement("a");
      link.id = "perf-navigation";
      link.textContent = "Navigate";
      link.style.cssText = "position:fixed;top:0;left:0;z-index:99999";
      link.href = path;
      document.body.append(link);
    }, path);
    await page.locator("#perf-navigation").click();
    await page.waitForFunction(
      (path: string) =>
        location.pathname.replace(/\/$/, "") === path.replace(/\/$/, ""),
      path,
    );
    await page.waitForTimeout(250);
  };
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__lifecycle.draws > 6);
  await page.evaluate(() => {
    window.__lifecycle.canvas = document.querySelector("canvas")!;
  });
  const initial = await snapshot(),
    routes = [];
  for (let round = 0; round < 3; round++)
    for (const route of [
      "/blog/",
      "/blog/site-and-terminal/",
      "/socials/",
      "/",
    ] as const) {
      await navigate(route);
      const state = await snapshot();
      const sameCanvas = await page.evaluate(
        () => document.querySelector("canvas")! === window.__lifecycle.canvas,
      );
      if (
        !sameCanvas ||
        state.contexts !== initial.contexts ||
        state.programs !== initial.programs ||
        state.canvases !== 1
      )
        failures.push({ route, round, state, sameCanvas });
      if (state.clock?.includes("--")) failures.push({ clock: route });
      routes.push({ route, state, sameCanvas });
      await page.mouse.wheel(0, 500);
    }
  await page.goBack();
  await page.waitForTimeout(250);
  await page.goForward();
  await page.waitForTimeout(250);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobile = await page.evaluate(() => ({
    width: document.querySelector("canvas")!.width,
    expected: Math.floor(innerWidth * 0.85),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  }));
  if (mobile.width !== mobile.expected) failures.push({ mobile });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);
  // Simulated visibility event tests lifecycle scheduling without relying on headless tab policy.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenBefore = (await snapshot()).draws;
  await page.waitForTimeout(200);
  const hiddenAfter = (await snapshot()).draws;
  if (hiddenBefore !== hiddenAfter)
    failures.push("hidden document still draws");
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(200);
  if ((await snapshot()).draws === hiddenAfter)
    failures.push("visibility resume failed");
  const editor = [];
  for (let visit = 0; visit < 2; visit++) {
    await navigate("/black-hole/");
    await page.getByTitle("Collapse Black Hole", { exact: true }).waitFor();
    await page.waitForFunction(() => (window.__blackHoleStats?.frame ?? 0) > 2);
    await page.getByLabel("Bloom", { exact: true }).fill("0.4");
    await page.getByLabel("Bloom", { exact: true }).press("Tab");
    await page.waitForFunction(
      () => window.__blackHoleStats?.bloomStrength === 0.4,
    );
    if ((await snapshot()).programs !== 6)
      failures.push("bloom programs missing or leaked");
    await page.getByLabel("Bloom", { exact: true }).fill("0");
    await page.getByLabel("Bloom", { exact: true }).press("Tab");
    await page.waitForFunction(() => window.__blackHoleStats?.passCount === 3);
    await page.getByLabel("Custom", { exact: true }).fill("voidCG08AA");
    await page.getByLabel("ASCII Effect", { exact: true }).uncheck();
    await page.waitForFunction(
      () => window.__blackHoleStats?.asciiEnabled === false,
    );
    await page.getByLabel("ASCII Effect", { exact: true }).check();
    await page.waitForFunction(
      () => window.__blackHoleStats?.asciiEnabled === true,
    );
    await page.getByTitle("Collapse ASCII", { exact: true }).click();
    await page.getByTitle("Expand ASCII", { exact: true }).click();
    editor.push(await snapshot());
    await navigate("/");
    await page.waitForTimeout(250);
    const state = await snapshot();
    if (state.programs !== 3 || state.textures !== 7 || state.canvases !== 1)
      failures.push({ editorCleanup: state });
  }
  await page.evaluate(() => {
    window.__lostContext = document
      .querySelector("canvas")!
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!;
    window.__lostContext.loseContext();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__lostContext.restoreContext());
  await page.waitForTimeout(500);
  const restored = await snapshot();
  if (restored.programs !== 3 || restored.canvases !== 1)
    failures.push({ restored });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(200);
  const reducedBefore = (await snapshot()).draws;
  await page.waitForTimeout(250);
  const reducedAfter = (await snapshot()).draws;
  if (reducedBefore !== reducedAfter)
    failures.push("reduced motion keeps drawing");
  await page.goto(origin + "/404.html", { waitUntil: "networkidle" });
  const notFound = await page.title();
  return {
    failures,
    consoleErrors,
    badRequests,
    initial,
    routes,
    mobile,
    editor,
    restored,
    reduced: { before: reducedBefore, after: reducedAfter },
    notFound,
  };
};
