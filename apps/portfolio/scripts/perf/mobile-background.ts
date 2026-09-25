// Run with playwright-cli run-code --filename=... against a production preview.
export default async (page: import("@playwright/test").Page) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  const browser = page.context().browser()!;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const errors: string[] = [],
    rendererRequests: string[] = [],
    failedRequests: string[] = [];
  const phone = await context.newPage();
  phone.on("pageerror", (e: { message: string }) => errors.push(e.message));
  phone.on("console", (m: { type: () => string; text: () => string }) => {
    if (m.type() === "error") errors.push(m.text());
  });
  phone.on("requestfailed", (r: { url: () => string }) =>
    failedRequests.push(r.url()),
  );
  phone.on("request", (r: { url: () => string }) => {
    if (
      /(?:BlackHole(?:Runtime|Core|WebGl|WebGpu|CellShaders|Gl|Shader|Controls)|\/_astro\/index\.)/.test(
        r.url(),
      )
    )
      rendererRequests.push(r.url());
  });
  await phone.addInitScript(() => {
    window.__pageLoads = 0;
    document.addEventListener("astro:page-load", () => window.__pageLoads++);
    window.__gpuContexts = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (["webgl", "webgl2", "experimental-webgl", "webgpu"].includes(kind))
        window.__gpuContexts++;
      return Reflect.apply(original, this, [kind, ...args]) as
        | RenderingContext
        | GPUCanvasContext
        | null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const checkStatic = async () => {
    // Let Astro finish the current navigation before starting another one
    // or rotating; intentionally overlapping transitions are cancelled.
    await phone.waitForFunction(
      () => !document.documentElement.hasAttribute("data-astro-transition"),
    );
    await phone
      .locator(".bh-background-still")
      .evaluate((image) => (image as HTMLImageElement).decode());
    const state = await phone.evaluate(() => ({
      contexts: window.__gpuContexts,
      live: document.querySelector<HTMLElement>("[data-black-hole-background]")!
        .dataset.bhLive,
      canvasDisplay: getComputedStyle(
        document.querySelector<HTMLElement>(".bh-background-live")!,
      ).display,
      imageVisibility: getComputedStyle(
        document.querySelector<HTMLElement>(".bh-background-still")!,
      ).visibility,
    }));
    if (
      state.contexts ||
      state.live ||
      state.canvasDisplay !== "none" ||
      state.imageVisibility !== "visible"
    )
      throw Error(JSON.stringify(state));
  };
  const navigate = async (action: () => Promise<unknown>, url: string) => {
    const before = await phone.evaluate(() => window.__pageLoads);
    await action();
    await phone.waitForURL(url);
    await phone.waitForFunction(
      (previous: number) => window.__pageLoads > previous,
      before,
    );
    await checkStatic();
  };
  try {
    await phone.goto(`${origin}/`);
    await checkStatic();
    await phone.screenshot({
      path: ".playwright-cli/mobile-background-portrait.png",
      scale: "css",
    });
    await phone.evaluate(() => {
      window.__originalBackground = document.querySelector<HTMLElement>(
        "[data-black-hole-background]",
      )!;
      window.scrollTo(0, 650);
    });
    await checkStatic();
    await navigate(
      () => phone.locator('a[href="/blog"]').first().click(),
      "**/blog",
    );
    if (
      !(await phone.evaluate(
        () =>
          window.__originalBackground ===
          document.querySelector<HTMLElement>("[data-black-hole-background]")!,
      ))
    )
      throw Error("Background was not persisted");
    await navigate(
      () => phone.locator('a[href="/socials"]').first().click(),
      "**/socials",
    );
    await navigate(() => phone.goBack(), "**/blog");
    await navigate(() => phone.goForward(), "**/socials");
    await navigate(
      () => phone.locator('a[href="/"]').first().click(),
      `${origin}/`,
    );
    await phone.setViewportSize({ width: 844, height: 390 });
    await checkStatic();
    await phone.screenshot({
      path: ".playwright-cli/mobile-background-landscape.png",
      scale: "css",
    });
    // Coarse-pointer devices remain static even above the size breakpoint.
    await phone.setViewportSize({ width: 1024, height: 900 });
    await checkStatic();
    if (rendererRequests.length || errors.length || failedRequests.length)
      throw Error(JSON.stringify({ rendererRequests, errors, failedRequests }));
    return {
      mobile: "portrait, landscape, scroll, routes, back/forward passed",
      gpuContexts: 0,
      rendererRequests,
      errors,
      failedRequests,
    };
  } finally {
    await context.close();
  }
};
