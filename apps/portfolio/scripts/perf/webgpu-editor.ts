export default async (page: import("@playwright/test").Page) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  const context = await page
      .context()
      .browser()!
      .newContext({ viewport: { width: 1440, height: 900 } }),
    p = await context.newPage();
  const errors: string[] = [],
    requests: string[] = [],
    results = [];
  p.on("pageerror", (e: { message: string }) => errors.push(e.message));
  p.on("console", (m: { type: () => string; text: () => string }) => {
    if (m.type() === "error") errors.push(m.text());
  });
  p.on("requestfailed", (r) => requests.push(r.url()));
  const navigate = async (path: string) => {
    await p.evaluate((path: string) => {
      const a = document.createElement("a");
      a.id = "gpu-navigation";
      a.href = path;
      a.textContent = "Navigate";
      a.style.cssText = "position:fixed;top:0;left:0;z-index:999999";
      document.body.append(a);
    }, path);
    await p.locator("#gpu-navigation").click();
    await p.waitForURL(origin + path);
  };
  await p.goto(origin + "/black-hole/");
  for (let visit = 0; visit < 2; visit++) {
    await p.waitForFunction(
      () =>
        window.__blackHoleStats?.backend === "webgpu" &&
        window.__blackHoleStats!.frame > 2,
      null,
      { timeout: 60000 },
    );
    results.push({
      step: "default",
      stats: await p.evaluate(() => window.__blackHoleStats!),
    });
    await p
      .locator("select")
      .filter({ has: p.locator('option[value="webgpu"]') })
      .selectOption("webgl2");
    await p.waitForFunction(
      () =>
        window.__blackHoleStats?.backend === "webgl2" &&
        window.__blackHoleStats!.frame > 2,
    );
    await p.evaluate(() => {
      window.__restoreCanvas = document.querySelector("canvas")!;
      window.__gl = document
        .querySelector("canvas")!
        .getContext("webgl2")!
        .getExtension("WEBGL_lose_context")!;
      window.__gl.loseContext();
    });
    await p.waitForTimeout(100);
    await p.evaluate(() => window.__gl.restoreContext());
    await p.waitForFunction(
      () => window.__restoreCanvas !== document.querySelector("canvas")!,
    );
    await p.waitForFunction(
      () =>
        window.__blackHoleStats?.backend === "webgl2" &&
        window.__blackHoleStats!.frame > 2,
    );
    await p
      .locator("select")
      .filter({ has: p.locator('option[value="webgpu"]') })
      .selectOption("auto");
    await p.waitForFunction(
      () =>
        window.__blackHoleStats?.backend === "webgpu" &&
        window.__blackHoleStats!.frame > 2,
    );
    for (const value of ["0", "0.4"]) {
      await p.getByLabel("Bloom", { exact: true }).fill(value);
      await p.getByLabel("Bloom", { exact: true }).press("Tab");
      await p.waitForFunction(
        (value) => window.__blackHoleStats?.bloomStrength === Number(value),
        value,
      );
    }
    await p.getByLabel("ASCII Effect", { exact: true }).uncheck();
    await p.waitForFunction(
      () => window.__blackHoleStats?.asciiEnabled === false,
    );
    await p.getByLabel("ASCII Effect", { exact: true }).check();
    await p.waitForFunction(
      () => window.__blackHoleStats?.asciiEnabled === true,
    );
    const expand = p.getByTitle("Expand ASCII", { exact: true });
    if (await expand.count()) await expand.click();
    await p
      .locator("select")
      .filter({ has: p.locator('option[value="gargantua"]') })
      .selectOption("custom");
    await p.getByLabel("Custom", { exact: true }).fill(" .:-=+*#%@");
    await p
      .locator("select")
      .filter({ has: p.locator('option[value="Menlo"]') })
      .selectOption("Menlo");
    await p.waitForFunction(
      () => window.__blackHoleStats?.fontFamily === "Menlo",
    );
    await p
      .locator("select")
      .filter({ has: p.locator('option[value="source"]') })
      .selectOption("custom");
    await p.waitForFunction(
      () => window.__blackHoleStats?.paletteMode === "custom",
    );
    results.push({
      step: "edited",
      stats: await p.evaluate(() => window.__blackHoleStats!),
    });
    const benchmark = p.getByTitle("Expand Benchmark", { exact: true });
    if (await benchmark.count()) await benchmark.click();
    await p.getByRole("button", { name: "Run Benchmark", exact: true }).click();
    await p.waitForTimeout(100);
    await navigate("/");
    await p.waitForTimeout(1500);
    results.push({
      step: "benchmark-cancelled",
      canvases: await p.locator("canvas").count(),
      errorText: await p.locator("[data-black-hole-error]").textContent(),
    });
    if (visit === 0) await navigate("/black-hole/");
  }
  await p.goBack();
  await p.waitForTimeout(400);
  await p.goForward();
  await p.waitForTimeout(400);
  await p.goto(origin + "/404.html");
  await p.waitForTimeout(300);
  const notFound = await p.title();
  await context.close();
  return { results, errors, requests, notFound };
};
