// Run in a fresh Playwright session with normal browser timing.
export default async (page: import("@playwright/test").Page) => {
  await page.goto(page.url().split("/").slice(0, 3).join("/") + "/");
  await page.waitForFunction(
    () => (window.__blackHoleAnimationSnapshot?.shaderTime ?? 0) > 2,
  );
  const start = await page.evaluate(() => {
    window.savedCanvas = document.querySelector("canvas")!;
    return structuredClone(window.__blackHoleAnimationSnapshot!);
  });
  await page.getByRole("link", { name: "socials", exact: true }).click();
  await page.waitForURL("**/socials");
  await page.waitForTimeout(8500);
  const end = await page.evaluate(() => ({
    sameCanvas: window.savedCanvas === document.querySelector("canvas")!,
    ...structuredClone(window.__blackHoleAnimationSnapshot!),
  }));
  if (
    !end.sameCanvas ||
    end.route !== "/socials" ||
    end.cameraPosition.some((v: unknown) => !Number.isFinite(v)) ||
    Math.hypot(
      ...end.cameraPosition.map(
        (v: number, i: number) => v - [1.155, 0.105, 0.63][i],
      ),
    ) > 0.02
  )
    throw new Error(JSON.stringify({ start, end }));
  return { passed: true, start, end };
};
