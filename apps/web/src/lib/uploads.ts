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

const MAX_PRESIGN_RETRIES = 2;

function isPresignExpiredStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 410;
}

type PutResult =
  | { ok: true }
  | { ok: false; message: string; presignExpired: boolean };

async function putObject(
  grant: UploadGrant,
  body: Blob,
  fetchImpl: FetchImpl,
  onProgress?: (ratio: number) => void,
): Promise<PutResult> {
  const headers = presignPutHeaders(grant.headers);
  if (onProgress && typeof XMLHttpRequest !== "undefined") {
    return await new Promise<PutResult>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", grant.url, true);
      for (const [name, value] of Object.entries(headers)) {
        xhr.setRequestHeader(name, value);
      }
      xhr.withCredentials = false;
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress(Math.min(1, event.loaded / event.total));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true });
          return;
        }
        resolve({
          ok: false,
          message: "原图上传失败",
          presignExpired: isPresignExpiredStatus(xhr.status),
        });
      };
      xhr.onerror = () => resolve({ ok: false, message: "存储暂时不可达", presignExpired: false });
      xhr.onabort = () => resolve({ ok: false, message: "上传已取消", presignExpired: false });
      xhr.send(body);
    });
  }

  let putResponse: Response;
  try {
    putResponse = await fetchImpl(grant.url, {
      method: "PUT",
      credentials: "omit",
      cache: "no-store",
      redirect: "manual",
      headers,
      body,
    });
  } catch {
    return { ok: false, message: "存储暂时不可达", presignExpired: false };
  }
  await putResponse.arrayBuffer().catch(() => undefined);
  if (putResponse.ok) return { ok: true };
  return {
    ok: false,
    message: "原图上传失败",
    presignExpired: isPresignExpiredStatus(putResponse.status),
  };
}

async function requestUploadGrant(
  fetchImpl: FetchImpl,
  filename: string,
  mime: string,
  size: number,
  albumId?: string,
): Promise<{ ok: true; grant: UploadGrant } | { ok: false; message: string }> {
  const payload: { filename: string; mime: string; size: number; albumId?: string } = {
    filename,
    mime,
    size,
  };
  if (albumId) payload.albumId = albumId;
  let grantResponse: Response;
  try {
    grantResponse = await fetchImpl("/api/v1/assets/upload-url", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, message: "API 暂时不可达" };
  }
  const granted = await readApi(grantResponse);
  if (!granted.ok) return granted;
  const grant = readUploadGrant(granted.body);
  if (!grant) return { ok: false, message: "响应不完整" };
  return { ok: true, grant };
}

export async function uploadPhotoToAlbum(
  input: {
    /** 不传则只入库，不 attach 到相册（图库上传）。 */
    albumId?: string;
    filename: string;
    mime: string;
    body: Blob;
    onPhase?: (phase: UploadPhase) => void;
    onPutProgress?: (ratio: number) => void;
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

  let grant: UploadGrant | null = null;
  let presignAttempt = 0;
  while (presignAttempt <= MAX_PRESIGN_RETRIES) {
    input.onPhase?.("request");
    const granted = await requestUploadGrant(fetchImpl, filename, mime, input.body.size, input.albumId);
    if (!granted.ok) return granted;
    grant = granted.grant;

    input.onPhase?.("put");
    const put = await putObject(grant, input.body, fetchImpl, input.onPutProgress);
    if (put.ok) break;
    if (put.presignExpired && presignAttempt < MAX_PRESIGN_RETRIES) {
      presignAttempt += 1;
      input.onPutProgress?.(0);
      continue;
    }
    return { ok: false, message: put.message };
  }
  if (!grant) return { ok: false, message: "响应不完整" };

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

  if (!input.albumId) {
    return { ok: true, assetId: grant.assetId };
  }

  return { ok: true, assetId: grant.assetId };
}
