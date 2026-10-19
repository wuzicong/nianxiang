import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const tinyPng = path.join(root, "fixtures/tiny.png");

const outDir = "/opt/cursor/artifacts/screenshots";
await mkdir(outDir, { recursive: true });

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

async function mockLibraryApi(page, { empty = false, failedCell = false } = {}) {
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
      if (empty) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ assets: [], hasMore: false }),
        });
      }
      const assets = failedCell
        ? [
            assetRow({ assetId: "ok-1", status: "ready", previews: { thumb: { url: "https://example.test/x.webp", expiresAt: "2099-01-01T00:00:00.000Z" } } }),
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await mockLibraryApi(page, { empty: true });
await page.goto("http://127.0.0.1:3000/library", { waitUntil: "networkidle" });
await page.waitForSelector(".lib-empty-library");
await page.screenshot({ path: path.join(outDir, "library-empty.png"), fullPage: false });

await mockLibraryApi(page, { failedCell: true });
await page.goto("http://127.0.0.1:3000/library", { waitUntil: "networkidle" });
await page.waitForSelector('.lib-tile[data-failed="true"]');
const failedTile = page.locator('.lib-tile[data-failed="true"]').first();
await failedTile.screenshot({ path: path.join(outDir, "library-failed-cell.png") });

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
const failedRow = page.locator('.album-upload-queue-item[data-upload-state="failed"]').first();
await failedRow.screenshot({ path: path.join(outDir, "library-upload-fail-row.png") });

await writeFile(
  path.join("/opt/cursor/artifacts", "library-shells-capture.txt"),
  "captured=library-empty.png,library-failed-cell.png,library-upload-fail-row.png\n",
);

await browser.close();
