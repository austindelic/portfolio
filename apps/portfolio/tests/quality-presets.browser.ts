// Run against the dev server with Playwright CLI run-code --filename=...
export default async function testQualityPresets(
  page: import("@playwright/test").Page,
) {
  const checks: (string | undefined)[] = [],
    results = [],
    errors: string[] = [],
    failed: { url: string; reason?: string }[] = [];
  await page.unrouteAll();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failed.push({ url: request.url(), reason: request.failure()?.errorText }),
  );
  const assert = (condition: boolean, message: string | undefined) => {
    if (!condition) throw Error(message);
    checks.push(message);
  };
  const stats = async () =>
    (
      await page.waitForFunction(() => window.__blackHoleStats! || false)
    ).jsonValue();
  const waitPreset = (preset: string) =>
    page.waitForFunction(
      (p: string | undefined) =>
        window.__blackHoleStats?.qualityPreset === p &&
        (window.__blackHoleStats?.frame ?? 0) > 5,
      preset,
    );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("http://127.0.0.1:4321/black-hole");
  await waitPreset("cinematic-ascii");
  const preset = page.getByRole("combobox", { name: "Preset", exact: true });
  await preset.waitFor();
  const choices = await preset
    .locator("option:not([disabled])")
    .allTextContents();
  assert(
    JSON.stringify(choices) ===
      JSON.stringify(["Balanced", "Cinematic ASCII", "Mobile"]),
    "exactly three selectable presets",
  );
  const cinematic = (
    s: import("../src/components/BlackHoleCore").BlackHoleStats,
  ) =>
    s.qualityValue === 0.72 &&
    s.sceneScale === 0.28 &&
    s.bloomScale === 0.3 &&
    s.maxDevicePixelRatio === 0.85 &&
    s.cellWidth === 6 &&
    s.cellHeight === 9 &&
    s.frameIntervalMs === 33 &&
    s.enableBloomPass;
  assert(
    cinematic(await stats()),
    "shader page starts with cinematic settings",
  );
  await page.getByRole("spinbutton", { name: "Speed", exact: true }).fill("0");
  for (const name of ["balanced", "mobile-safe", "cinematic-ascii"]) {
    await preset.selectOption(name);
    await waitPreset(name);
    const s = await stats();
    results.push({
      preset: name,
      fps: s.fps,
      trace: s.qualityValue,
      scene: s.sceneScale,
      bloom: s.enableBloomPass,
    });
    if (name === "balanced")
      assert(
        s.qualityValue === 0.72 && s.sceneScale === 0.36 && s.enableBloomPass,
        "Balanced unchanged",
      );
    if (name === "mobile-safe")
      assert(
        s.qualityValue === 0.72 &&
          s.sceneScale === 0.22 &&
          s.frameIntervalMs === 50 &&
          s.enableBloomPass &&
          s.bloomScale === 0.12 &&
          s.maxDevicePixelRatio === 0.6 &&
          s.cellWidth === 7 &&
          s.cellHeight === 11,
        "Mobile enables cinematic sampling and bloom within its lower-cost budget",
      );
    if (name === "cinematic-ascii")
      assert(cinematic(s), "Cinematic ASCII restores merged settings");
    await page.screenshot({ path: `/tmp/preset-${name}.png` });
  }
  await page
    .getByRole("spinbutton", { name: "Scene", exact: true })
    .fill("0.4");
  await waitPreset("custom");
  assert(
    await preset.evaluate((element) => {
      const el = element as HTMLSelectElement;
      return (
        el.value === "custom" &&
        el.selectedOptions[0].disabled &&
        el.selectedOptions[0].textContent!.trim() === "Custom"
      );
    }),
    "Custom is a nonselectable status",
  );
  await page
    .getByRole("checkbox", { name: "ASCII Effect", exact: true })
    .uncheck();
  await preset.selectOption("cinematic-ascii");
  await waitPreset("cinematic-ascii");
  assert(!(await stats()).asciiEnabled, "preset switch preserves ASCII toggle");
  await page
    .getByRole("checkbox", { name: "ASCII Effect", exact: true })
    .check();
  await page
    .getByRole("spinbutton", { name: "Exposure", exact: true })
    .fill("1.8");
  await preset.selectOption("balanced");
  await waitPreset("balanced");
  assert((await stats()).exposure === 1.8, "preset switch preserves exposure");
  await preset.selectOption("cinematic-ascii");
  await waitPreset("cinematic-ascii");
  await page
    .getByRole("combobox", { name: "Backend", exact: true })
    .selectOption("webgpu");
  await page.waitForFunction(
    () =>
      window.__blackHoleStats?.backend === "webgpu" &&
      (window.__blackHoleStats?.frame ?? 0) > 15,
  );
  assert(cinematic(await stats()), "WebGPU uses the same preset settings");
  await preset.selectOption("mobile-safe");
  await waitPreset("mobile-safe");
  const mobileGpu = await stats();
  assert(
    mobileGpu.qualityValue === 0.72 &&
      mobileGpu.enableBloomPass &&
      mobileGpu.frameIntervalMs === 50 &&
      mobileGpu.maxDevicePixelRatio === 0.6,
    "WebGPU Mobile retains the cinematic features and mobile budget",
  );
  await page.goto("http://127.0.0.1:4321/");
  await waitPreset("cinematic-ascii");
  await page.waitForFunction(
    () => window.__blackHoleStats?.animationPhase === "idle",
  );
  assert(
    cinematic(await stats()) &&
      (await stats()).exposure === 2 &&
      (await stats()).bloomStrength === 0.65,
    "portfolio starts with cinematic defaults",
  );
  await page.getByRole("link", { name: "blog", exact: true }).click();
  await page.waitForURL("**/blog");
  await page.waitForFunction(
    () => window.__blackHoleStats?.animationPhase === "idle",
  );
  assert(cinematic(await stats()), "navigation preserves cinematic settings");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:4321/");
  await waitPreset("cinematic-ascii");
  assert(
    cinematic(await stats()),
    "mobile viewport retains preset with runtime safety limits",
  );
  assert(errors.length === 0, "no console or runtime errors");
  assert(
    failed.every(
      (r) => r.reason === "net::ERR_ABORTED" && r.url.endsWith("/blog"),
    ),
    "no failed asset requests",
  );
  return { passed: checks.length, checks, results, failed };
}
