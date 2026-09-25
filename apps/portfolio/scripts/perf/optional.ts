export default async (page: import("@playwright/test").Page) => {
  const origin = page.url().split("/").slice(0, 3).join("/"),
    errors: string[] = [],
    failures: (string | Record<string, unknown>)[] = [];
  page.on("pageerror", (e: { message: string }) => errors.push(e.message));
  await page.goto(origin + "/black-hole/?optional=1", {
    waitUntil: "networkidle",
  });
  const backend = page
    .locator("label")
    .filter({ has: page.getByText("Backend", { exact: true }) })
    .locator("select");
  await backend.selectOption("webgpu");
  await page.waitForTimeout(1500);
  const alternate = await page.evaluate(() => ({
    available: !!navigator.gpu,
    stats: window.__blackHoleStats!,
    error: document.body.innerText.slice(-300),
  }));
  await backend.selectOption("auto");
  await page.waitForTimeout(500);
  await page.getByTitle("Expand Benchmark", { exact: true }).click();
  await page
    .getByRole("button", { name: "Run Benchmark", exact: true })
    .click();
  await page.waitForTimeout(300);
  if (
    !(await page
      .getByRole("button", { name: "Running...", exact: true })
      .count())
  )
    failures.push("benchmark did not start");
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "/";
    a.id = "leave-editor";
    a.textContent = "Home";
    document.body.append(a);
  });
  await page.locator("#leave-editor").click();
  await page.waitForURL(origin + "/");
  await page.waitForTimeout(1200);
  const home = await page.evaluate(() => ({
    canvases: document.querySelectorAll("canvas").length,
    editor: !!document.querySelector<HTMLElement>("[data-black-hole-control]")!,
    title: document.title,
  }));
  if (home.canvases !== 1 || home.editor) failures.push({ home });
  return { alternate, home, errors, failures };
};
