import { expect, test } from "@playwright/test";

test("loads the Studio controls and animates the Fourier reconstruction", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4173" && url.protocol !== "data:" && url.protocol !== "blob:") {
      externalRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/Spinier/);
  await expect(page.locator("#status-line")).toContainText("Soft star");
  await expect(page.getByLabel("Number of harmonics")).toHaveValue("8");
  await expect(page.getByLabel("Simulation phase")).toHaveValue("640");

  const initialPixels = await canvasSignature(page);
  await setRange(page, "harmonics-slider", 1);
  await expect(page.locator("#harmonics-value")).toHaveText("1");
  expect(await canvasSignature(page)).not.toBe(initialPixels);

  await setRange(page, "speed-slider", 3);
  await expect(page.locator("#speed-value")).toHaveText("3×");
  await page.getByRole("button", { name: "Play animation" }).click();
  await page.waitForTimeout(180);
  const advancedPhase = Number((await page.locator("#phase-slider").inputValue())) / 1000;
  expect(advancedPhase).toBeGreaterThan(0.64);

  await setRange(page, "phase-slider", 200);
  await expect(page.getByRole("button", { name: "Play animation" })).toBeVisible();
  await expect(page.locator("#phase-value")).toHaveText("20%");
  await setRange(page, "fade-slider", 0);
  await expect(page.locator("#fade-value")).toHaveText("0%");
  const sourceToggle = page.locator("label[for='source-toggle']");
  await sourceToggle.click();
  await expect(page.getByRole("checkbox", { name: "Source outline" })).not.toBeChecked();
  await sourceToggle.click();
  await expect(page.getByRole("checkbox", { name: "Source outline" })).toBeChecked();
  expect(externalRequests).toEqual([]);
});

test("processes imported SVG and raster contours locally and keeps the current drawing after errors", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4173" && url.protocol !== "data:" && url.protocol !== "blob:") {
      externalRequests.push(request.url());
    }
  });
  await page.goto("/");
  await page.screenshot({ path: "test-results/spinier-desktop.png" });

  await page.locator("#file-input").setInputFiles({
    name: "parallel.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(12 8)"><path fill="none" d="M0 0 C20 -20 40 20 60 0"/><circle cx="82" cy="0" r="12"/></g></svg>`),
  });
  await expect(page.locator("#status-line")).toContainText("parallel.svg");
  await expect(page.locator("#contour-count")).toHaveText("2 contours");

  const malformedBefore = await page.locator("#contour-count").textContent();
  await page.locator("#file-input").setInputFiles({
    name: "broken.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg><path"),
  });
  await expect(page.locator("#status-line")).toHaveClass(/is-error/);
  await expect(page.locator("#contour-count")).toHaveText(malformedBefore!);

  const pngDataUrl = await page.evaluate(() => {
    const source = document.createElement("canvas");
    source.width = 48;
    source.height = 48;
    const context = source.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 48, 48);
    context.fillStyle = "black";
    context.fillRect(11, 9, 27, 30);
    context.clearRect(18, 16, 10, 12);
    return source.toDataURL("image/png");
  });
  await page.locator("#file-input").setInputFiles({
    name: "silhouette.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngDataUrl.split(",")[1]!, "base64"),
  });
  await expect(page.locator("#status-line")).toContainText("silhouette.png");
  await expect(page.locator("#contour-count")).toHaveText("2 contours");
  await expect(page.getByLabel("Raster luminance threshold")).toBeDisabled();
  await expect(page.locator(".toggle-subtitle")).toHaveText("Trace transparent regions");
  await page.getByLabel("Invert raster").check();
  await expect(page.locator("#contour-count")).toHaveText("1 contour");
  await page.getByLabel("Invert raster").uncheck();

  const opaquePngDataUrl = await page.evaluate(() => {
    const source = document.createElement("canvas");
    source.width = 48;
    source.height = 48;
    const context = source.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 48, 48);
    context.fillStyle = "black";
    context.fillRect(11, 9, 27, 30);
    context.fillStyle = "white";
    context.fillRect(18, 16, 10, 12);
    return source.toDataURL("image/png");
  });
  await page.locator("#file-input").setInputFiles({
    name: "opaque-ring.png",
    mimeType: "image/png",
    buffer: Buffer.from(opaquePngDataUrl.split(",")[1]!, "base64"),
  });
  await expect(page.locator("#status-line")).toContainText("opaque-ring.png");
  await expect(page.locator("#contour-count")).toHaveText("2 contours");
  await expect(page.getByLabel("Raster luminance threshold")).toBeEnabled();
  await expect(page.locator(".toggle-subtitle")).toHaveText("Trace lighter regions");
  for (const value of [35, 190, 75, 170]) await setRange(page, "threshold-slider", value);
  await expect(page.locator("#threshold-value")).toHaveText("170");
  await expect(page.locator("#status-line")).toContainText("opaque-ring.png");
  await page.getByLabel("Invert raster").check();
  await expect(page.locator("#contour-count")).toHaveText("3 contours");
  expect(externalRequests).toEqual([]);
});

test("reflows the Studio for a phone viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.screenshot({ path: "test-results/spinier-phone.png", fullPage: true });
  await expect(page.getByRole("heading", { name: "Simulation", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open image" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await page.getByLabel("Number of harmonics").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#harmonics-value")).toHaveText("9");
});

async function setRange(page: import("@playwright/test").Page, id: string, value: number): Promise<void> {
  await page.locator(`#${id}`).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function canvasSignature(page: import("@playwright/test").Page): Promise<string> {
  return page.locator("#plot-canvas").evaluate((element) => (element as HTMLCanvasElement).toDataURL());
}
