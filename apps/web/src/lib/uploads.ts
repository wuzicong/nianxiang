import { apiMessage, parseJsonResponse, type ApiErrorBody } from "./api-client";
import { visibleMessage } from "./album-assets";

/** 与 packages/shared 的 isSafeStorageId 相同。素材 id 会拼进 API 路径。 */
const SAFE_STORAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function isSafeStorageId(value: string): boolean {
  return SAFE_STORAGE_ID.test(value);
}

export type UploadPhase = "request" | "put" | "complete" | "attach";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT));

const BLOCKED_PUT_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "set-cookie",
]);

export interface UploadGrant {
  assetId: string;
  url: string;
  headers: Record<string, string>;
}

export function imageMime(file: { type: string; name: string }): string | null {
  const type = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (ALLOWED_MIME.has(type)) return type;
  const ext = file.name.trim().split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

export function uploadPhaseLabel(phase: UploadPhase): string {
  switch (phase) {
    case "request":
      return "正在申请上传地址…";
    case "put":
      return "正在上传原图…";
    case "complete":
      return "正在确认上传…";
    case "attach":
      return "正在加入相册…";
  }
}

/** 浏览器会自己写 Content-Length。不要把会话 Cookie 带到对象存储。 */
export function presignPutHeaders(headers: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (BLOCKED_PUT_HEADERS.has(name.toLowerCase())) continue;
    next[name] = value;
  }
  return next;
}

export function readUploadGrant(value: unknown): UploadGrant | null {
  if (!value || typeof value !== "object") return null;
  const body = value as {
    assetId?: unknown;
    url?: unknown;
    method?: unknown;
    headers?: unknown;
  };
  if (typeof body.assetId !== "string" || !isSafeStorageId(body.assetId)) return null;
  if (typeof body.url !== "string" || body.url.length < 8 || body.url.length > 8192) return null;
  if (body.method !== undefined && body.method !== "PUT") return null;
  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!body.headers || typeof body.headers !== "object" || Array.isArray(body.headers)) return null;
  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(body.headers)) {
    if (typeof headerValue !== "string") return null;
    headers[name] = headerValue;
  }
  return { assetId: body.assetId, url: parsed.toString(), headers };
}

async function readApi(response: Response): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  const body = await parseJsonResponse<ApiErrorBody>(response);
  if (!response.ok) return { ok: false, message: visibleMessage(apiMessage(body), "请求失败") };
  return { ok: true, body };
}

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export async function uploadPhotoToAlbum(
  input: {
    albumId: string;
    filename: string;
    mime: string;
    body: Blob;
    onPhase?: (phase: UploadPhase) => void;
  },
  deps: { fetchImpl?: FetchImpl } = {},
): Promise<{ ok: true; assetId: string } | { ok: false; message: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const mime = imageMime({ type: input.mime, name: input.filename });
  if (!mime) return { ok: false, message: "只接受 jpeg、png、webp、gif" };
  if (!Number.isInteger(input.body.size) || input.body.size < 1) {
    return { ok: false, message: "不能上传空文件" };
  }
  const filename = input.filename.trim();
  if (!filename) return { ok: false, message: "文件名不能为空" };

  input.onPhase?.("request");
  let grantResponse: Response;
  try {
    grantResponse = await fetchImpl("/api/v1/assets/upload-url", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ filename, mime, size: input.body.size }),
    });
  } catch {
    return { ok: false, message: "API 暂时不可达" };
  }
  const granted = await readApi(grantResponse);
  if (!granted.ok) return granted;
  const grant = readUploadGrant(granted.body);
  if (!grant) return { ok: false, message: "响应不完整" };

  input.onPhase?.("put");
  let putResponse: Response;
  try {
    putResponse = await fetchImpl(grant.url, {
      method: "PUT",
      credentials: "omit",
      cache: "no-store",
      redirect: "manual",
      headers: presignPutHeaders(grant.headers),
      body: input.body,
    });
  } catch {
    return { ok: false, message: "存储暂时不可达" };
  }
  await putResponse.arrayBuffer().catch(() => undefined);
  if (!putResponse.ok) return { ok: false, message: "原图上传失败" };

  input.onPhase?.("complete");
  let completeResponse: Response;
  try {
    completeResponse = await fetchImpl(`/api/v1/assets/${encodeURIComponent(grant.assetId)}/complete`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: "{}",
    });
  } catch {
    return { ok: false, message: "API 暂时不可达" };
  }
  const completed = await readApi(completeResponse);
  if (!completed.ok) return completed;

  input.onPhase?.("attach");
  let attachResponse: Response;
  try {
    attachResponse = await fetchImpl(`/api/v1/albums/${encodeURIComponent(input.albumId)}/assets`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ assetIds: [grant.assetId] }),
    });
  } catch {
    return { ok: false, message: "API 暂时不可达" };
  }
  const attached = await readApi(attachResponse);
  if (!attached.ok) return attached;
  return { ok: true, assetId: grant.assetId };
}
