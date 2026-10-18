/**
 * 本地验证：预签名 PUT → complete → 衍生图出现在私有桶。
 * 需要 API、Worker、Postgres、Redis、MinIO 已经起来。不打印预签名 URL。
 */
import { randomBytes } from "node:crypto";
import {
  createObjectStore,
  objectStoreConfigFromRuntime,
} from "../packages/storage/dist/object-store.js";
import { loadRuntimeConfig } from "../packages/storage/dist/runtime-config.js";

const api = process.env.API_BASE ?? "http://127.0.0.1:3001";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

function redact(text) {
  return String(text).replace(/\?[^\s]*/g, "?***").slice(0, 300);
}

function cookiePair(response) {
  const lines =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const line = lines.find((item) => item.startsWith("memora_session="));
  const pair = line?.split(";")[0] ?? "";
  if (!pair || pair === "memora_session=") {
    console.error("[verify] register did not set a session cookie");
    process.exit(1);
  }
  return pair;
}

async function postJson(path, body, cookie) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${api}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: redact(text) };
  }
  return { status: response.status, body: parsed, response };
}

const health = await fetch(`${api}/health`, { signal: AbortSignal.timeout(5_000) }).catch((err) => {
  console.error(`[verify] API 不可达 ${api}/health (${err.message})`);
  process.exit(1);
});
if (!health.ok) {
  console.error(`[verify] health ${health.status}`);
  process.exit(1);
}

const anonymous = await postJson("/api/v1/assets/upload-url", {
  filename: "pixel.png",
  mime: "image/png",
  size: png.length,
  userId: "local",
});
if (anonymous.status !== 401) {
  console.error("[verify] expected 401 before login", anonymous.status, anonymous.body?.error);
  process.exit(1);
}

const email = `verify-${randomBytes(6).toString("hex")}@memora.test`;
const password = randomBytes(18).toString("base64url");
const registered = await postJson("/api/v1/auth/register", { email, password });
if (registered.status !== 201) {
  console.error("[verify] register failed", registered.status, registered.body?.error);
  process.exit(1);
}
const cookie = cookiePair(registered.response);

const created = await postJson(
  "/api/v1/assets/upload-url",
  {
    filename: "pixel.png",
    mime: "image/png",
    size: png.length,
  },
  cookie,
);
if (created.status !== 201) {
  console.error("[verify] upload-url failed", created.status, created.body);
  process.exit(1);
}

const upload = created.body;
const headers = { ...upload.headers };
delete headers["Content-Length"];
delete headers["content-length"];
const put = await fetch(upload.url, {
  method: "PUT",
  headers,
  body: png,
  signal: AbortSignal.timeout(15_000),
});
if (!put.ok) {
  const detail = redact(await put.text());
  console.error(`[verify] PUT failed status=${put.status} body=${detail}`);
  process.exit(1);
}

const completed = await postJson(`/api/v1/assets/${upload.assetId}/complete`, {}, cookie);
if (completed.status !== 200) {
  console.error("[verify] complete failed", completed.status, completed.body);
  process.exit(1);
}

let asset = null;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const response = await fetch(`${api}/api/v1/assets/${upload.assetId}`, {
    headers: { cookie },
    signal: AbortSignal.timeout(5_000),
  });
  asset = await response.json();
  if (asset.status === "ready" || asset.status === "failed") break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (!asset || asset.status !== "ready") {
  console.error("[verify] derivative did not become ready", {
    assetId: upload.assetId,
    status: asset?.status ?? null,
    error: asset?.error ?? null,
  });
  process.exit(1);
}

const runtime = loadRuntimeConfig();
const anonymousOriginal = await fetch(
  `${runtime.s3.endpoint.replace(/\/$/, "")}/${runtime.s3.bucket}/${upload.key}`,
  { signal: AbortSignal.timeout(5_000) },
);
if (anonymousOriginal.status === 200) {
  console.error("[verify] anonymous read of the original succeeded");
  process.exit(1);
}

const objects = createObjectStore(objectStoreConfigFromRuntime(runtime));
const bytes = {};
for (const [size, key] of Object.entries(asset.derivatives ?? {})) {
  const head = await objects.head(key);
  if (!head || head.contentLength < 1) {
    console.error(`[verify] missing derivative ${size} key=${key}`);
    process.exit(1);
  }
  if (head.contentType && !head.contentType.includes("webp")) {
    console.error(`[verify] derivative ${size} content-type=${head.contentType}`);
    process.exit(1);
  }
  bytes[size] = head.contentLength;
  const anonymous = await fetch(
    `${runtime.s3.endpoint.replace(/\/$/, "")}/${runtime.s3.bucket}/${key}`,
    { signal: AbortSignal.timeout(5_000) },
  );
  if (anonymous.status === 200) {
    console.error(`[verify] anonymous read of derivative ${size} succeeded`);
    process.exit(1);
  }
}

const summary = {
  ok: true,
  assetId: upload.assetId,
  key: upload.key,
  expiresAt: upload.expiresAt,
  status: asset.status,
  derivatives: bytes,
  exif: asset.exif,
  anonymousOriginal: anonymousOriginal.status,
};
console.log(JSON.stringify(summary));
