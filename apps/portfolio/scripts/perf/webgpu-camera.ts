export default async (page: import("@playwright/test").Page) => {
  const context = await page
      .context()
      .browser()!
      .newContext({ viewport: { width: 1440, height: 900 } }),
    p = await context.newPage(),
    errors: string[] = [],
    requests: string[] = [];
  p.on("pageerror", (e: { message: string }) => errors.push(e.message));
  p.on("console", (m: { type: () => string; text: () => string }) => {
    if (m.type() === "error") errors.push(m.text());
  });
  p.on("requestfailed", (r) => requests.push(r.url()));
  await p.goto(page.url().split("/").slice(0, 3).join("/") + "/black-hole/");
  await p.waitForFunction(
    () =>
      window.__blackHoleStats?.backend === "webgpu" &&
      window.__blackHoleStats!.frame > 2,
  );
  for (const [label, value] of [
    ["Position", "12, 3, 19"],
    ["Forward", "-0.5, -0.1, -0.8"],
    ["Universe", "-1"],
  ]) {
    await p.getByLabel(label, { exact: true }).fill(value);
    await p.getByLabel(label, { exact: true }).press("Enter");
  }
  await p.waitForFunction(
    () =>
      window.__blackHoleStats?.universeSign === -1 &&
      window.__blackHoleStats!.cameraPosition[0] === 12,
  );
  const edited = await p.evaluate(() => window.__blackHoleStats!);
  await p.locator("canvas").click({ position: { x: 700, y: 400 } });
  await p.keyboard.down("w");
  await p.waitForTimeout(400);
  await p.keyboard.up("w");
  await p.waitForTimeout(350);
  const moved = await p.evaluate(() => window.__blackHoleStats!);
  if (
    JSON.stringify(edited.cameraPosition) ===
    JSON.stringify(moved.cameraPosition)
  )
    throw Error("Camera keyboard movement failed");
  const play = p.getByRole("button", { name: "Play", exact: true });
  if (await play.count()) await play.click();
  await p.waitForFunction(
    () => window.__blackHoleStats?.animationPlaying === true,
  );
  await p.getByRole("button", { name: "Pause", exact: true }).click();
  await p.waitForFunction(
    () => window.__blackHoleStats?.animationPlaying === false,
  );
  const paused = await p.evaluate(
    () => window.__blackHoleStats!.animationSequenceTime,
  );
  await p.waitForTimeout(500);
  const stillPaused = await p.evaluate(
    () => window.__blackHoleStats!.animationSequenceTime,
  );
  if (paused !== stillPaused) throw Error("Animation advanced while paused");
  const adapter = await p.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter();
    return a
      ? {
          vendor: a.info.vendor,
          architecture: a.info.architecture,
          device: a.info.device,
          description: a.info.description,
        }
      : null;
  });
  await context.close();
  return { edited, moved, paused, stillPaused, adapter, errors, requests };
};
