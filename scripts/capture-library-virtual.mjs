import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = "/opt/cursor/artifacts/screenshots";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:3000/library?libraryMock=2000", { waitUntil: "networkidle" });
await page.waitForSelector(".lib-frame");
const tiles = await page.locator(".lib-tile").count();
const virtualTiles = await page.locator("[data-virtual-tiles]").getAttribute("data-virtual-tiles");
await page.screenshot({ path: path.join(outDir, "library-virtual-top.png"), fullPage: false });
await page.evaluate(() => window.scrollTo(0, 12000));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, "library-virtual-scrolled.png"), fullPage: false });
const tilesAfter = await page.locator(".lib-tile").count();
await writeFile(
  path.join("/opt/cursor/artifacts", "library-virtual-dom-cap.txt"),
  `totalPhotos=2000\ndomTilesTop=${tiles}\ndomTilesScrolled=${tilesAfter}\nariaVirtualTiles=${virtualTiles}\n`,
);
await browser.close();
