import { visibleMessage } from "./album-assets";
import { apiMessage, parseJsonResponse, type ApiErrorBody } from "./api-client";
import { createAlbum } from "./albums-api";
import {
  batchIds,
  LIBRARY_ASSET_BATCH,
  LIBRARY_SELECTION_LIMIT,
  parseLibraryPayload,
  safeAlbumId,
  validAlbumTitle,
  validThemeId,
  type LibraryPhoto,
} from "./library";

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export async function listLibrary(
  deps: { fetchImpl?: FetchImpl } = {},
): Promise<
  | { ok: true; photos: LibraryPhoto[]; hasMore: boolean }
  | { ok: false; status: number; message: string }
> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl("/api/v1/assets", {
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch {
    return { ok: false, status: 0, message: "API 暂时不可达" };
  }
  const body = await parseJsonResponse<ApiErrorBody>(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: visibleMessage(apiMessage(body), response.status === 401 ? "请先登录" : "照片暂时没加载出来"),
    };
  }
  const parsed = parseLibraryPayload(body);
  return { ok: true, photos: parsed.photos, hasMore: parsed.hasMore };
}

/**
 * 图库建册：createAlbum({ title, themeId, assetIds })。
 * 关联资产仍走 POST /api/v1/albums/:id/assets（见 albums-api.ts）。
 */
export async function createThemedAlbum(
  input: { title: string; themeId: string; assetIds: readonly string[]; albumId?: string | null },
  deps: { fetchImpl?: FetchImpl } = {},
): Promise<
  | { ok: true; albumId: string }
  | { ok: false; status: number; message: string; albumId?: string; attachFailed?: boolean }
> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const title = validAlbumTitle(input.title);
  const themeId = validThemeId(input.themeId);
  if (!title) return { ok: false, status: 400, message: "标题需要 1 到 80 个字符" };
  if (!themeId) return { ok: false, status: 400, message: "模板不存在" };
  const assetIds = [...new Set(input.assetIds)];
  if (assetIds.length < 1) return { ok: false, status: 400, message: "先选择照片" };
  if (assetIds.length > LIBRARY_SELECTION_LIMIT) {
    return { ok: false, status: 400, message: "一次最多 200 张" };
  }

  let albumId = input.albumId ? safeAlbumId(input.albumId) : null;
  if (input.albumId && !albumId) return { ok: false, status: 400, message: "相册不存在" };

  if (!albumId) {
    const created = await createAlbum({ title, themeId, assetIds }, { fetchImpl });
    if (!created.ok) {
      return {
        ok: false,
        status: created.status,
        message: created.message,
        albumId: created.albumId,
        attachFailed: created.attachFailed,
      };
    }
    return { ok: true, albumId: created.album.albumId };
  }

  for (const chunk of batchIds(assetIds, LIBRARY_ASSET_BATCH)) {
    const added = await postJson(fetchImpl, `/api/v1/albums/${encodeURIComponent(albumId)}/assets`, {
      assetIds: chunk,
    });
    if (!added.ok) {
      return { ok: false, status: added.status, message: added.message, albumId, attachFailed: true };
    }
  }
  return { ok: true, albumId };
}

async function postJson(
  fetchImpl: FetchImpl,
  path: string,
  body: unknown,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; message: string }> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, message: "API 暂时不可达" };
  }
  const parsed = await parseJsonResponse<ApiErrorBody>(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: visibleMessage(apiMessage(parsed), "请求失败"),
    };
  }
  return { ok: true, body: parsed };
}
