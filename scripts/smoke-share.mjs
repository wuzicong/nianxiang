/**
 * 可分享 MVP 冒烟。
 *
 * 注册 / 登录 → 建相册 → 上传 3 张图 → 等衍生图 → 打开成册预览 →
 * 创建带密码分享 → 无痕打开 /s/<token> → 错密码 401 → 对密码看到衍生图 →
 * 撤销后 404。
 *
 * 预览页、分享页和公开接口里不能出现 /originals/、EXIF 或明文密码。
 * 应用日志里不能出现明文分享令牌、会话令牌或密码。
 * 主人上传原图的预签名地址本身含 /originals/，不记入这次泄漏检查。
 *
 * 地址用环境变量，方便对着另一套栈复跑：
 * WEB_BASE、API_BASE、ML_BASE。
 * 日志二选一：SMOKE_LOG_FILES（本机进程）或 SMOKE_LOG_SERVICES（Compose 服务名）。
 *
 * 用法见 README「本地冒烟」。不要把令牌、密码或预签名打到终端。
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { EXIF_DATE, GPS_LAT_TEXT, GPS_LNG_TEXT, jpegWithGps, PNG_1X1 } from "./smoke-fixtures.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const webBase = (process.env.WEB_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const apiBase = (process.env.API_BASE ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const mlBase = (process.env.ML_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const artifactDir =
  process.env.SMOKE_ARTIFACT_DIR ?? (existsSync("/opt/cursor/artifacts") ? "/opt/cursor/artifacts" : "");

const THEMES = [
  { id: "cotton-candy", name: "棉花糖日记" },
  { id: "kyoto-lantern", name: "京都纸灯" },
  { id: "magazine-heirloom", name: "杂志 Heirloom" },
];

const secrets = [];
const passwords = [];
const watched = [];
const pendingRecords = [];

function noteSecret(value) {
  if (typeof value === "string" && value.length >= 8) secrets.push(value);
}

function notePassword(value) {
  noteSecret(value);
  passwords.push(value);
}

function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.split(secret).join("***");
  text = text.replace(/\/api\/v1\/public\/shares\/[A-Za-z0-9_-]{20,}/g, "/api/v1/public/shares/***");
  text = text.replace(/\/s\/[A-Za-z0-9_-]{20,}/g, "/s/***");
  text = text.replace(/memora_session=[^;\s]+/g, "memora_session=***");
  text = text.replace(/\?[^\s"'<>]*/g, "?***");
  return text;
}

function say(message) {
  console.log(redact(message));
}

function headerValue(headers, name) {
  if (headers && typeof headers.get === "function") return headers.get(name) ?? "";
  return headers?.[name] ?? "";
}

function assertNoStore(headers, label) {
  const cache = headerValue(headers, "cache-control");
  const referrer = headerValue(headers, "referrer-policy");
  const robots = headerValue(headers, "x-robots-tag");
  if (!cache.includes("no-store")) throw new Error(`${label} missing no-store (${cache})`);
  if (referrer !== "no-referrer") throw new Error(`${label} referrer-policy is ${referrer || "empty"}`);
  if (!robots.includes("noindex")) throw new Error(`${label} missing noindex`);
}

function forbiddenMarkers(extra = []) {
  return [
    "/originals/",
    GPS_LAT_TEXT,
    GPS_LNG_TEXT,
    '"exif"',
    "hasGps",
    "GPSLatitude",
    "DateTimeOriginal",
    EXIF_DATE,
    ...extra,
  ].filter((marker) => marker.length > 0);
}

function markerName(marker) {
  if (marker.startsWith("acct-") || marker.startsWith("share-")) return "password";
  if (marker === GPS_LAT_TEXT || marker === GPS_LNG_TEXT) return "gps";
  if (marker === EXIF_DATE) return "exif-date";
  return marker;
}

function assertSurface(label, text, extra = []) {
  for (const marker of forbiddenMarkers(extra)) {
    if (text.includes(marker)) throw new Error(`${label} contains a forbidden marker (${markerName(marker)})`);
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`expected json, got ${text.slice(0, 120)}`);
  }
}

function watch(page) {
  page.on("request", (request) => {
    const url = request.url();
    if (/[?&]password=/i.test(url)) throw new Error("password was placed in a request URL");
    for (const secret of passwords) {
      if (secret && url.includes(secret)) throw new Error("password was placed in a request URL");
    }
  });
  page.on("response", (response) => {
    const job = (async () => {
      const url = response.url();
      const headers = response.headers();
      const contentType = headers["content-type"] ?? "";
      const image = contentType.startsWith("image/") || url.includes("/derivatives/");
      let body = "";
      if (!image) {
        body = await response.text().catch(() => "");
      }
      watched.push({ url, status: response.status(), headers, contentType, body });
    })();
    pendingRecords.push(job);
  });
}

async function flushResponses() {
  await Promise.all(pendingRecords);
}

function inspectResponses(extra) {
  for (const record of watched) {
    if (record.url.includes("/_next/")) continue;
    if ((record.contentType || "").includes("javascript")) continue;
    if (record.url.includes("/assets/upload-url")) continue;
    if (record.url.includes("/originals/")) {
      const appSurface =
        record.url.includes("/api/v1/") ||
        record.url.includes("/preview") ||
        record.url.includes("/s/");
      if (appSurface) throw new Error("originals leaked into an app response URL");
      continue;
    }
    const html = (record.contentType || "").includes("text/html");
    const interesting =
      record.url.includes("/api/v1/") ||
      (html &&
        (record.url.includes("/preview") || /\/s\/[A-Za-z0-9_-]{20,}/.test(record.url)));
    if (!interesting) continue;
    if ((record.contentType || "").startsWith("image/")) continue;
    try {
      assertSurface("response", record.body || "", extra);
    } catch (err) {
      const pathOnly = record.url.replace(/\?.*$/, "").replace(/\/s\/[A-Za-z0-9_-]{20,}/g, "/s/***").replace(/\/public\/shares\/[A-Za-z0-9_-]{20,}/g, "/public/shares/***");
      throw new Error(`${err.message} status=${record.status} url=${pathOnly}`);
    }
  }
}

async function snap(page, name) {
  if (!artifactDir || !page) return;
  await page
    .locator(".album-share-link-readonly")
    .evaluateAll((nodes) => {
      for (const node of nodes) {
        if (node instanceof HTMLInputElement) node.value = "";
      }
    })
    .catch(() => undefined);
  mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: true }).catch(() => undefined);
}

async function fetchJson(url, init) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), ...init });
  const body = await readJson(response);
  return { response, body };
}

function assertLocked(body, themeId, title) {
  if (body.error !== "password_required" || body.message !== "需要密码" || body.passwordRequired !== true) {
    throw new Error("locked share body drifted");
  }
  if (body.themeId !== themeId) throw new Error("locked share theme drifted");
  if (JSON.stringify(body).includes(title)) throw new Error("locked share leaked the album");
}

function assertUnavailable(body, title) {
  if (body.error !== "share_unavailable" || body.message !== "无法打开分享") {
    throw new Error("unavailable share body drifted");
  }
  if (body.themeId !== undefined || body.passwordRequired !== undefined) {
    throw new Error("unavailable share leaked a challenge field");
  }
  if (JSON.stringify(body).includes(title)) throw new Error("unavailable share leaked the album");
}

function logSource() {
  if (process.env.SMOKE_LOG_FILES?.trim()) return "files";
  if (process.env.SMOKE_LOG_SERVICES?.trim()) return "compose";
  throw new Error(
    "设置 SMOKE_LOG_FILES（本机 api/web/worker 日志文件，逗号分隔）或 SMOKE_LOG_SERVICES（Compose 服务名，逗号分隔）",
  );
}

async function preflightHttp() {
  const api = await fetchJson(`${apiBase}/health`);
  if (!api.response.ok || api.body.service !== "memora-api") throw new Error("API health failed");
  const web = await fetch(`${webBase}/login`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const webText = await web.text();
  if (!web.ok || !webText.includes("登录")) throw new Error("web login page failed");
  const ml = await fetchJson(`${mlBase}/health`);
  if (!ml.response.ok || ml.body.service !== "memora-ml") throw new Error("ML health failed");
  if (ml.body.device !== undefined && ml.body.device !== "cpu") throw new Error("ML device is not cpu");
  say(`health api web ml (${webBase})`);
}

async function appLogs(sinceIso) {
  if (logSource() === "files") {
    const files = process.env.SMOKE_LOG_FILES.split(",").map((item) => item.trim()).filter(Boolean);
    if (files.length < 1) throw new Error("SMOKE_LOG_FILES is empty");
    return files.map((file) => readFileSync(file, "utf8")).join("\n");
  }
  const services = process.env.SMOKE_LOG_SERVICES.split(",").map((item) => item.trim()).filter(Boolean);
  if (services.length < 1) throw new Error("SMOKE_LOG_SERVICES is empty");
  const { stdout } = await execFileAsync(
    "docker",
    ["compose", "logs", "--no-color", "--since", sinceIso, ...services],
    { cwd: root, maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout;
}

function assertLogs(logs, token, session) {
  if (!logs.includes("[memora-api] register user=")) {
    throw new Error("app logs do not include this registration");
  }
  if (!logs.includes("share create")) throw new Error("app logs do not include share create");
  if (!logs.includes("media.derivative done")) throw new Error("app logs do not include derivative completion");
  for (const secret of [token, session, ...secrets, GPS_LAT_TEXT, GPS_LNG_TEXT, "hasGps", "GPSLatitude"]) {
    if (secret && logs.includes(secret)) throw new Error("app logs contain a secret or EXIF value");
  }
}

async function waitForUploaded(page) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const summary = await page.locator("body").innerText();
    if (summary.includes("3 张照片已加入相册")) return;
    if (
      summary.includes("没有加入相册") ||
      summary.includes("原图上传失败") ||
      summary.includes("存储暂时不可达") ||
      summary.includes("API 暂时不可达")
    ) {
      throw new Error(`upload stopped: ${summary.slice(0, 240)}`);
    }
    await page.waitForTimeout(400);
  }
  throw new Error("upload did not finish");
}

async function waitForReady(page) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const statuses = await page.locator("[data-asset-status]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-asset-status")),
    );
    if (statuses.includes("failed")) {
      const text = await page.locator("body").innerText();
      throw new Error(`derivative failed: ${text.slice(0, 240)}`);
    }
    if (statuses.length >= 3 && statuses.every((status) => status === "ready")) return;
    await page.waitForTimeout(1_000);
  }
  throw new Error("derivatives were not ready");
}

async function main() {
  const startedAt = new Date(Date.now() - 15_000).toISOString();
  const theme = THEMES[randomBytes(1)[0] % THEMES.length];
  const stamp = randomBytes(4).toString("hex");
  const email = `smoke-${stamp}@memora.test`;
  const accountPassword = `acct-${randomBytes(12).toString("base64url")}`;
  const sharePassword = `share-${randomBytes(12).toString("base64url")}`;
  const title = `冒烟${stamp}`;
  notePassword(accountPassword);
  notePassword(sharePassword);
  noteSecret(email);

  say(`theme=${theme.id}`);
  logSource();
  await preflightHttp();

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "缺少 playwright。在仓库根目录执行 pnpm install，然后 pnpm exec playwright install --with-deps chromium",
    );
  }

  const work = mkdtempSync(path.join(tmpdir(), "memora-smoke-"));
  const files = [
    path.join(work, "one.png"),
    path.join(work, "two.png"),
    path.join(work, "three.jpg"),
  ];
  writeFileSync(files[0], PNG_1X1);
  writeFileSync(files[1], PNG_1X1);
  writeFileSync(files[2], jpegWithGps());

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
  });
  const pages = [];
  let failed = true;
  try {
    const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ownerContext.newPage();
    pages.push(page);
    page.setDefaultTimeout(20_000);
    watch(page);

    await page.goto(`${webBase}/login`);
    await page.getByText("未登录").waitFor();
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(accountPassword);
    await page.getByRole("button", { name: "注册" }).click();
    await page.getByText("注册成功").waitFor();
    say("registered");

    await page.goto(`${webBase}/albums`);
    await page.getByLabel("标题").fill(title);
    await page.getByLabel("主题").selectOption(theme.id);
    await page.getByRole("button", { name: "创建相册" }).click();
    await page.getByRole("link", { name: title }).click();
    await page.waitForURL(/\/albums\/[0-9a-f-]{36}$/);
    const albumId = new URL(page.url()).pathname.split("/").pop();
    if (!albumId) throw new Error("missing album id");
    say("album created");

    await page.locator('input[type="file"]').setInputFiles(files);
    await page.getByRole("button", { name: "上传并加入相册" }).click();
    await waitForUploaded(page);
    await waitForReady(page);
    const albumHtml = await page.content();
    assertSurface("album page", albumHtml, [sharePassword, accountPassword]);
    say("derivatives ready");

    await page.goto(`${webBase}/albums/${albumId}/preview?layout=story`);
    await page.getByRole("heading", { name: "成册预览" }).waitFor();
    await page.waitForSelector("img[data-photo-id]");
    await page.getByText(/已排入 \d+ 张/).waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("img[data-photo-id]")].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
    const previewSrcs = await page.locator("img[data-photo-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("src") || ""),
    );
    if (previewSrcs.length < 1) throw new Error("preview has no photos");
    for (const src of previewSrcs) {
      if (!src.includes("/derivatives/") || src.includes("/originals/")) {
        throw new Error("preview photo is not a derivative");
      }
    }
    assertSurface("preview", await page.content(), [sharePassword, accountPassword]);
    await snap(page, "smoke-preview.png");
    say(`preview photos=${previewSrcs.length}`);

    await page.goto(`${webBase}/albums/${albumId}`);
    await page.getByLabel(/分享密码/).fill(sharePassword);
    await page.getByRole("button", { name: "创建分享链接" }).click();
    const linkValue = await page.locator(".album-share-link-readonly").inputValue();
    const issued = new URL(linkValue);
    if (issued.origin !== webBase) throw new Error("share link origin drifted");
    if (!/^\/s\/[A-Za-z0-9_-]{43}$/.test(issued.pathname) || issued.search || issued.hash) {
      throw new Error("share link shape drifted");
    }
    const token = issued.pathname.slice(3);
    noteSecret(token);
    if (linkValue.includes(sharePassword) || linkValue.includes(accountPassword)) {
      throw new Error("password was written into the share link");
    }
    const ownerHtml = await page.content();
    if (ownerHtml.includes(sharePassword)) throw new Error("owner page still shows the share password");
    assertSurface("owner after share", ownerHtml.replaceAll(token, ""), [sharePassword, accountPassword]);
    say("share created");

    const gate = await fetchJson(`${apiBase}/api/v1/public/shares/${token}`);
    if (gate.response.status !== 401) throw new Error(`public get status ${gate.response.status}`);
    assertNoStore(gate.response.headers, "public get");
    assertLocked(gate.body, theme.id, title);
    assertSurface("public get", JSON.stringify(gate.body), [sharePassword, accountPassword]);
    const proxied = await fetchJson(`${webBase}/api/v1/public/shares/${token}`);
    if (proxied.response.status !== 401) throw new Error(`proxied get status ${proxied.response.status}`);
    assertNoStore(proxied.response.headers, "proxied get");
    assertLocked(proxied.body, theme.id, title);

    const guest = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestPage = await guest.newPage();
    pages.push(guestPage);
    guestPage.setDefaultTimeout(20_000);
    watch(guestPage);
    await guestPage.goto(linkValue);
    await guestPage.getByRole("heading", { name: "这本相册需要密码" }).waitFor();
    await guestPage.getByText(theme.name).waitFor();
    assertSurface("challenge", await guestPage.content(), [sharePassword, accountPassword, title]);
    await snap(guestPage, "smoke-challenge.png");
    say("challenge shown");

    const wrongPassword = `${sharePassword}no`;
    notePassword(wrongPassword);
    const wrongWait = guestPage.waitForResponse(
      (response) => response.url().includes("/unlock") && response.request().method() === "POST",
    );
    await guestPage.locator("#share-password").fill(wrongPassword);
    await guestPage.getByRole("button", { name: "打开" }).click();
    const wrong = await wrongWait;
    if (wrong.status() !== 401) throw new Error(`wrong password status ${wrong.status()}`);
    assertNoStore(wrong.headers(), "wrong unlock");
    const wrongBody = JSON.parse(await wrong.text());
    assertUnavailable(wrongBody, title);
    assertSurface("wrong unlock", JSON.stringify(wrongBody), [sharePassword, accountPassword, wrongPassword]);
    await guestPage.getByText("无法打开分享").waitFor();
    if (guestPage.url().includes("password=") || guestPage.url().includes(sharePassword)) {
      throw new Error("password landed in the page URL");
    }
    const directWrong = await fetchJson(`${apiBase}/api/v1/public/shares/${token}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: wrongPassword }),
    });
    if (directWrong.response.status !== 401) throw new Error("direct wrong password was not 401");
    assertNoStore(directWrong.response.headers, "direct wrong unlock");
    assertUnavailable(directWrong.body, title);
    say("wrong password is 401");

    const openWait = guestPage.waitForResponse(
      (response) => response.url().includes("/unlock") && response.request().method() === "POST",
    );
    await guestPage.locator("#share-password").fill("");
    await guestPage.locator("#share-password").fill(sharePassword);
    await guestPage.getByRole("button", { name: "打开" }).click();
    const opened = await openWait;
    if (opened.status() !== 200) throw new Error(`unlock status ${opened.status()}`);
    assertNoStore(opened.headers(), "unlock");
    const openedBody = JSON.parse(await opened.text());
    if (openedBody.album?.title !== title || openedBody.album?.themeId !== theme.id) {
      throw new Error("opened share metadata drifted");
    }
    if (!Array.isArray(openedBody.assets) || openedBody.assets.length !== 3) {
      throw new Error("opened share does not list 3 assets");
    }
    for (const asset of openedBody.assets) {
      const urls = ["thumb", "preview", "hero"]
        .map((size) => asset.derivatives?.[size]?.url)
        .filter((url) => typeof url === "string");
      if (urls.length < 1) throw new Error("opened asset has no derivative");
      for (const url of urls) {
        if (!url.includes("/derivatives/") || url.includes("/originals/")) {
          throw new Error("opened asset signed the wrong object");
        }
      }
    }
    assertSurface("opened share", JSON.stringify(openedBody), [sharePassword, accountPassword]);
    await guestPage.locator('main[data-share-state="open"]').waitFor();
    await guestPage.waitForFunction(() => {
      const images = [...document.querySelectorAll('main[data-share-state="open"] img')];
      return images.length >= 3 && images.every((img) => img.complete && img.naturalWidth > 0);
    });
    assertSurface("open page", await guestPage.content(), [sharePassword, accountPassword]);
    const guestCookies = await guest.cookies();
    if (guestCookies.length > 0) throw new Error("unlock stored a cookie");
    await snap(guestPage, "smoke-unlocked.png");
    say("derivatives visible");

    await guestPage.reload();
    await guestPage.getByRole("heading", { name: "这本相册需要密码" }).waitFor();
    say("refresh asks for the password again");

    await page.getByRole("button", { name: "撤销此链接" }).click();
    await page.locator('[data-status="revoked"]').waitFor();
    say("revoked");

    const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const revokedPage = await fresh.newPage();
    pages.push(revokedPage);
    watch(revokedPage);
    const revokedDoc = await revokedPage.goto(linkValue);
    if (!revokedDoc || revokedDoc.status() !== 404) {
      throw new Error(`revoked page status ${revokedDoc?.status() ?? "none"}`);
    }
    await revokedPage.getByRole("heading", { name: "分享不存在" }).waitFor();
    assertSurface("revoked page", await revokedPage.content(), [sharePassword, accountPassword, title]);
    await snap(revokedPage, "smoke-revoked.png");

    const revokedApi = await fetchJson(`${apiBase}/api/v1/public/shares/${token}`);
    if (revokedApi.response.status !== 404) throw new Error(`revoked get status ${revokedApi.response.status}`);
    assertNoStore(revokedApi.response.headers, "revoked get");
    if (revokedApi.body.error !== "share_not_found" || revokedApi.body.message !== "分享不存在") {
      throw new Error("revoked get body drifted");
    }
    assertSurface("revoked get", JSON.stringify(revokedApi.body), [sharePassword, accountPassword, title]);
    const revokedUnlock = await fetchJson(`${apiBase}/api/v1/public/shares/${token}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: sharePassword }),
    });
    if (revokedUnlock.response.status !== 401) throw new Error("revoked unlock was not a unified 401");
    assertNoStore(revokedUnlock.response.headers, "revoked unlock");
    assertUnavailable(revokedUnlock.body, title);
    say("revoked page is 404");

    await flushResponses();
    inspectResponses([sharePassword, accountPassword]);
    const session = (await ownerContext.cookies()).find((cookie) => cookie.name === "memora_session")?.value;
    if (!session) throw new Error("owner session cookie missing");
    noteSecret(session);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const logs = await appLogs(startedAt);
    assertLogs(logs, token, session);
    say("logs have no plaintext token");
    say("smoke ok");
    failed = false;
  } finally {
    if (failed) {
      for (let index = 0; index < pages.length; index += 1) {
        await snap(pages[index], `smoke-failed-${index}.png`);
      }
    }
    await browser.close();
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(redact(err?.stack || err));
  process.exitCode = 1;
});
