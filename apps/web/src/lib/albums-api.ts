import { parseAlbumAssets, visibleMessage, type AlbumAssetView } from "./album-assets";
import { apiMessage, parseJsonResponse, type ApiErrorBody } from "./api-client";
import { LIBRARY_SELECTION_LIMIT } from "./library";

/** 建册 / 挂素材 404：后端不区分缺失与无权限，前端统一这一句。 */
export const ALBUM_ASSET_UNAVAILABLE = "部分照片无法使用，请刷新图库后重试";

export function albumAssetClientMessage(status: number, body: ApiErrorBody | null, fallback = "请求失败"): string {
  if (status === 404) return ALBUM_ASSET_UNAVAILABLE;
  return visibleMessage(apiMessage(body), fallback);
}

export interface AlbumSummary {
  albumId: string;
  title: string;
  themeId: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShareSummary {
  shareId: string;
  albumId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  passwordProtected: boolean;
}

export interface CreatedShare extends ShareSummary {
  token: string;
  path: string;
}

export interface CreateShareInput {
  password?: string;
  expiresAt?: string | null;
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  fetchImpl: FetchImpl = fetch,
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; body: ApiErrorBody | null }> {
  const response = await fetchImpl(path, {
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = await parseJsonResponse<ApiErrorBody & T>(response);
  if (!response.ok) {
    return { ok: false, status: response.status, body };
  }
  return { ok: true, status: response.status, data: body as T };
}

export async function listAlbums(): Promise<
  { ok: true; albums: AlbumSummary[] } | { ok: false; status: number; message: string }
> {
  const result = await apiFetch<{ albums?: AlbumSummary[] }>("/api/v1/albums");
  if (!result.ok) return { ok: false, status: result.status, message: apiMessage(result.body) };
  return { ok: true, albums: result.data.albums ?? [] };
}

/** 旧接口或补挂素材时，仍按批 POST .../assets（每批最多 50）。 */
const ALBUM_ASSET_BATCH = 50;

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

async function attachAlbumAssetsInBatches(
  fetchImpl: FetchImpl,
  albumId: string,
  assetIds: readonly string[],
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  for (let offset = 0; offset < assetIds.length; offset += ALBUM_ASSET_BATCH) {
    const chunk = assetIds.slice(offset, offset + ALBUM_ASSET_BATCH);
    const added = await apiFetch<unknown>(
      `/api/v1/albums/${encodeURIComponent(albumId)}/assets`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetIds: chunk }),
      },
      fetchImpl,
    );
    if (!added.ok) {
      return { ok: false, status: added.status, message: albumAssetClientMessage(added.status, added.body) };
    }
  }
  return { ok: true };
}

/**
 * 建册并可选关联一批资产。默认一次 POST { title, themeId, assetIds }（≤200，同事务）。
 * attachAlbumAssetsInBatches 仅给图库补挂重试等场景用。
 */
export async function createAlbum(
  input: {
    title: string;
    themeId: string;
    assetIds?: readonly string[];
  },
  deps: { fetchImpl?: FetchImpl } = {},
): Promise<
  | { ok: true; album: AlbumSummary }
  | { ok: false; status: number; message: string; albumId?: string; attachFailed?: boolean }
> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const assetIds = input.assetIds ? [...new Set(input.assetIds)] : [];
  if (assetIds.length > LIBRARY_SELECTION_LIMIT) {
    return { ok: false, status: 400, message: `一次最多 ${LIBRARY_SELECTION_LIMIT} 张` };
  }
  const payload: { title: string; themeId: string; assetIds?: string[] } = {
    title: input.title,
    themeId: input.themeId,
  };
  if (assetIds.length > 0) payload.assetIds = assetIds;
  const result = await apiFetch<{ album?: AlbumSummary }>(
    "/api/v1/albums",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
    fetchImpl,
  );
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: albumAssetClientMessage(result.status, result.body, "建册失败"),
    };
  }
  if (!result.data.album) {
    return { ok: false, status: 500, message: "响应不完整" };
  }
  return { ok: true, album: result.data.album };
}

/** 显式 fallback：向已有相册按批挂素材（例如建册后补挂重试）。 */
export async function attachAlbumAssets(
  albumId: string,
  assetIds: readonly string[],
  deps: { fetchImpl?: FetchImpl } = {},
): Promise<
  | { ok: true }
  | { ok: false; status: number; message: string; albumId: string; attachFailed: true }
> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const unique = [...new Set(assetIds)];
  if (unique.length > LIBRARY_SELECTION_LIMIT) {
    return {
      ok: false,
      status: 400,
      message: `一次最多 ${LIBRARY_SELECTION_LIMIT} 张`,
      albumId,
      attachFailed: true,
    };
  }
  const attached = await attachAlbumAssetsInBatches(fetchImpl, albumId, unique);
  if (!attached.ok) {
    return { ok: false, status: attached.status, message: attached.message, albumId, attachFailed: true };
  }
  return { ok: true };
}

export async function getAlbum(
  albumId: string,
): Promise<
  | { ok: true; album: AlbumSummary; assets: AlbumAssetView[] }
  | { ok: false; status: number; message: string }
> {
  const result = await apiFetch<{ album?: AlbumSummary; assets?: unknown }>(
    `/api/v1/albums/${encodeURIComponent(albumId)}`,
  );
  if (!result.ok) {
    return { ok: false, status: result.status, message: apiMessage(result.body) };
  }
  if (!result.data.album) {
    return { ok: false, status: 500, message: "响应不完整" };
  }
  return { ok: true, album: result.data.album, assets: parseAlbumAssets(result.data.assets) };
}

export async function listShares(
  albumId: string,
): Promise<{ ok: true; shares: ShareSummary[] } | { ok: false; status: number; message: string }> {
  const result = await apiFetch<{ shares?: ShareSummary[] }>(
    `/api/v1/albums/${encodeURIComponent(albumId)}/shares`,
  );
  if (!result.ok) return { ok: false, status: result.status, message: apiMessage(result.body) };
  return { ok: true, shares: result.data.shares ?? [] };
}

export async function createShare(
  albumId: string,
  input: CreateShareInput,
): Promise<
  | { ok: true; share: CreatedShare }
  | { ok: false; status: number; message: string; error?: string }
> {
  const payload: Record<string, string> = {};
  if (input.expiresAt) payload.expiresAt = input.expiresAt;
  if (input.password !== undefined && input.password.length > 0) {
    payload.password = input.password;
  }
  const result = await apiFetch<{ share?: CreatedShare }>(
    `/api/v1/albums/${encodeURIComponent(albumId)}/shares`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: apiMessage(result.body),
      error: result.body?.error,
    };
  }
  if (!result.data.share) {
    return { ok: false, status: 500, message: "响应不完整" };
  }
  return { ok: true, share: result.data.share };
}

export async function revokeShare(
  shareId: string,
): Promise<{ ok: true; share: ShareSummary } | { ok: false; status: number; message: string }> {
  const result = await apiFetch<{ share?: ShareSummary }>(
    `/api/v1/shares/${encodeURIComponent(shareId)}/revoke`,
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
  );
  if (!result.ok) {
    return { ok: false, status: result.status, message: apiMessage(result.body) };
  }
  if (!result.data.share) {
    return { ok: false, status: 500, message: "响应不完整" };
  }
  return { ok: true, share: result.data.share };
}
