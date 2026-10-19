import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const tinyPng = path.join(root, "fixtures/tiny.png");

const outDir = "/opt/cursor/artifacts/screenshots";
await mkdir(outDir, { recursive: true });

const viewport = { width: 375, height: 812 };

function assetRow(overrides) {
  return {
    assetId: "demo-asset-1",
    filename: "vacation.jpg",
    status: "ready",
    width: 1200,
    height: 800,
    error: null,
    takenAt: "2024-06-15T14:30:00",
    uploadedAt: "2024-06-15T14:31:00.000Z",
    previews: {},
    ...overrides,
  };
}

async function mockLibraryApi(page, { empty = false, failedCell = false, loadError = false } = {}) {
  await page.unroute("**/api/v1/**").catch(() => {});
  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { email: "demo@memora.test" } }),
      });
    }
    if (url.includes("/assets") && !url.includes("upload-url") && !url.includes("/complete")) {
      if (loadError) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "unavailable" }),
        });
      }
      if (empty) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ assets: [], hasMore: false }),
        });
      }
      const assets = failedCell
        ? [
            assetRow({
              assetId: "ok-1",
              status: "ready",
              previews: { thumb: { url: "https://example.test/x.webp", expiresAt: "2099-01-01T00:00:00.000Z" } },
            }),
            assetRow({
              assetId: "fail-1",
              status: "failed",
              error: "derivative_failed",
              previews: {},
            }),
          ]
        : [assetRow({ previews: { thumb: { url: "https://example.test/x.webp", expiresAt: "2099-01-01T00:00:00.000Z" } } })];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ assets, hasMore: false }),
      });
    }
    return route.continue();
  });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport });

await mockLibraryApi(page, { empty: true });
await page.goto("http://127.0.0.1:3000/library", { waitUntil: "networkidle" });
await page.waitForSelector(".lib-empty-library");
await page.locator(".lib-empty-library").screenshot({ path: path.join(outDir, "library-empty-375.png") });

await mockLibraryApi(page, { loadError: true });
await page.goto("http://127.0.0.1:3000/library", { waitUntil: "networkidle" });
await page.waitForSelector(".lib-empty-load-error");
await page.locator(".lib-empty-load-error").screenshot({ path: path.join(outDir, "library-load-error-375.png") });

await mockLibraryApi(page, { failedCell: true });
await page.goto("http://127.0.0.1:3000/library", { waitUntil: "networkidle" });
await page.waitForSelector('.lib-tile[data-failed="true"]');
await page.locator('.lib-tile[data-failed="true"]').first().screenshot({
  path: path.join(outDir, "library-failed-cell-375.png"),
});

await mockLibraryApi(page, { empty: true });
await page.route("**/api/v1/assets/upload-url", (route) =>
  route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "upload_unavailable" }),
  }),
);
await page.goto("http://127.0.0.1:3000/library", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "上传第一批照片" }).click();
await page.locator(".album-upload-file-input").setInputFiles(tinyPng);
await page.waitForSelector('.album-upload-queue-item[data-upload-state="failed"]', { timeout: 15000 });
await page.waitForSelector('.album-upload-summary[data-kind="error"]');
const drawer = page.locator(".lib-drawer-panel");
await drawer.screenshot({ path: path.join(outDir, "library-upload-fail-375.png") });

await writeFile(
  path.join("/opt/cursor/artifacts", "library-shells-capture.txt"),
  "viewport=375\n" +
    "captured=library-empty-375.png,library-load-error-375.png,library-upload-fail-375.png,library-failed-cell-375.png\n",
);

await browser.close();
