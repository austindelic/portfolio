// Open the Astro dev server first, then use Playwright CLI run-code --filename=...
export default async function testExploreSettings(
  page: import("@playwright/test").Page,
) {
  const errors: string[] = [],
    failed: string[] = [],
    checks: (string | undefined)[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => failed.push(request.url()));
  const assert = (ok: boolean, message: string | undefined) => {
    if (!ok) throw Error(message);
    checks.push(message);
  };
  const stats = () => page.evaluate(() => window.__blackHoleStats!);
  const wait = (predicate: {
    (): boolean;
    (): boolean;
    (): boolean;
    (): boolean;
  }) => page.waitForFunction(predicate);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(page.url().split("/").slice(0, 3).join("/") + "/");
  await wait(() => (window.__blackHoleStats?.frame ?? 0) > 5);
  await page.locator("[data-explore-trigger]").click();
  await page.locator("[data-explore-settings]").click();
  const ascii = page.getByRole("checkbox", {
    name: "ASCII effect",
    exact: true,
  });
  const slider = page.getByRole("slider", { name: /^Render resolution/ });
  await wait(() => document.body.classList.contains("bh-exploring"));
  // Wait for the statistics published after entry to capture the frozen camera.
  const beforeTime = (await stats()).shaderTime;
  await page.waitForFunction(
    (t: number) => window.__blackHoleStats!.shaderTime > t + 0.6,
    beforeTime,
  );
  const initial = await stats();
  const initialPercent = await slider.inputValue();
  await page.evaluate(() => {
    window.__exploreCanvas = document.querySelector<HTMLElement>(
      "[data-black-hole-background] canvas",
    )!;
  });
  const setResolution = async (value: number) => {
    await slider.fill(String(value));
    await page.waitForFunction((value: number) => {
      const s = window.__blackHoleStats!;
      return (
        s.sceneWidth ===
          Math.max(1, Math.ceil((s.renderWidth * value) / 100)) &&
        s.sceneHeight === Math.max(1, Math.ceil((s.renderHeight * value) / 100))
      );
    }, value);
    const s = await stats();
    assert(
      s.renderWidth === initial.renderWidth &&
        s.renderHeight === initial.renderHeight,
      `canvas unchanged at ${value}%`,
    );
    assert(
      JSON.stringify(s.asciiCellSize) === JSON.stringify(initial.asciiCellSize),
      `glyph size unchanged at ${value}%`,
    );
    assert(
      JSON.stringify(s.cameraPosition) ===
        JSON.stringify(initial.cameraPosition),
      `camera unchanged at ${value}%`,
    );
  };
  await ascii.uncheck();
  await wait(() => window.__blackHoleStats!.asciiEnabled === false);
  await setResolution(1);
  await setResolution(100);
  await ascii.check();
  await wait(() => window.__blackHoleStats!.asciiEnabled === true);
  await setResolution(25);
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLInputElement>("#explore-resolution")!.value ===
      "26",
  );
  await page.keyboard.press("Tab");
  assert(
    await page
      .locator("#explore-time")
      .evaluate((el: Element | null) => el === document.activeElement),
    "keyboard tab reaches the next setting",
  );
  await page.locator("[data-explore-reset]").click();
  assert(
    (await slider.inputValue()) === "26" && (await ascii.isChecked()),
    "Reset view preserves rendering settings",
  );
  await page.keyboard.down("w");
  await page.waitForFunction(
    (position) =>
      JSON.stringify(window.__blackHoleStats!.cameraPosition) !==
      JSON.stringify(position),
    initial.cameraPosition,
  );
  await page.keyboard.up("w");
  assert(
    await page.evaluate(
      () =>
        window.__exploreCanvas ===
        document.querySelector<HTMLElement>(
          "[data-black-hole-background] canvas",
        )!,
    ),
    "live updates retain canvas and runtime",
  );
  await page.screenshot({ path: "/tmp/explore-settings.png" });
  await page.keyboard.press("Escape");
  assert(
    await page.locator("#explore-settings-content").isHidden(),
    "Escape closes settings first",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    (original: { sceneWidth: number; sceneHeight: number }) => {
      const s = window.__blackHoleStats!;
      return (
        !document.body.classList.contains("bh-exploring") &&
        s.sceneWidth === original.sceneWidth &&
        s.sceneHeight === original.sceneHeight
      );
    },
    initial,
  );
  await page.locator("[data-explore-trigger]").click();
  await page.locator("[data-explore-settings]").click();
  assert(
    (await slider.inputValue()) === initialPercent,
    "re-entry restores original resolution",
  );
  await slider.fill("20");
  await ascii.uncheck();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("astro:before-preparation")),
  );
  await page.waitForFunction(
    (original: { sceneWidth: number }) =>
      !document.body.classList.contains("bh-exploring") &&
      window.__blackHoleStats!.sceneWidth === original.sceneWidth,
    initial,
  );
  assert(errors.length === 0, `no console/page errors: ${errors.join("; ")}`);
  assert(failed.length === 0, `no failed requests: ${failed.join("; ")}`);
  return { backend: initial.backend, checks };
}
