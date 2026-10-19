/**
 * 375px 分享/解锁页截图（开发服 + smokeRateLimit / 真实密码分享）。
 * 输出到 /opt/cursor/artifacts/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const webBase = (process.env.WEB_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const apiBase = (process.env.API_BASE ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const outDir = "/opt/cursor/artifacts/screenshots";
const tokenPlaceholder = "a".repeat(43);

mkdirSync(outDir, { recursive: true });

async function waitForWeb() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(webBase);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("web not ready");
}

async function registerAndPasswordShare() {
  const email = `mobile-cap-${Date.now()}@memora.test`;
  const password = "share-cap-pw-1";
  const sharePassword = "unlock-test-pw-8";

  const reg = await fetch(`${apiBase}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!reg.ok) throw new Error(`register ${reg.status}`);
  const cookie = reg.headers.get("set-cookie")?.split(";")[0] ?? "";

  const album = await fetch(`${apiBase}/api/v1/albums`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      cookie,
    },
    body: JSON.stringify({ title: "移动端截图册", themeId: "cotton-candy" }),
  });
  const albumBody = await album.json();
  const albumId = albumBody.album?.albumId;
  if (!albumId) throw new Error("no album");

  const share = await fetch(`${apiBase}/api/v1/albums/${albumId}/shares`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      cookie,
    },
    body: JSON.stringify({ password: sharePassword }),
  });
  const shareBody = await share.json();
  const token = shareBody.share?.token;
  if (!token) throw new Error("no share token");
  return { token, sharePassword };
}

async function shot(page, name, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(400);
  const path = `${outDir}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

await waitForWeb();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await context.newPage();

const paths = [];

paths.push(
  await shot(
    page,
    "share-rate-limit-375-kyoto",
    `${webBase}/s/${tokenPlaceholder}?smokeRateLimit=429&t=kyoto-lantern`,
  ),
);

let share;
try {
  share = await registerAndPasswordShare();
  for (const theme of ["cotton-candy", "kyoto-lantern", "magazine-heirloom"]) {
    paths.push(
      await shot(page, `share-unlock-375-${theme}`, `${webBase}/s/${share.token}?t=${theme}`),
    );
  }

  await page.goto(`${webBase}/s/${share.token}?t=cotton-candy`, { waitUntil: "networkidle" });
  await page.fill("#share-password", "wrong-password-1");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(600);
  const failedPath = `${outDir}/share-unlock-failed-375.png`;
  await page.screenshot({ path: failedPath, fullPage: true });
  paths.push(failedPath);

  await page.route(`**/api/v1/public/shares/${share.token}/unlock`, async (route) => {
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "42", "content-type": "application/json" },
      body: JSON.stringify({ error: "rate_limited" }),
    });
  });
  await page.fill("#share-password", share.sharePassword);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(800);
  const limitedPath = `${outDir}/share-unlock-429-375.png`;
  await page.screenshot({ path: limitedPath, fullPage: true });
  paths.push(limitedPath);
} catch (error) {
  writeFileSync(`${outDir}/capture-share-mobile-error.txt`, String(error));
}

await browser.close();
writeFileSync(`${outDir}/capture-share-mobile-manifest.json`, JSON.stringify({ paths }, null, 2));
console.log(JSON.stringify(paths, null, 2));
