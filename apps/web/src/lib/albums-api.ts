import { apiMessage, parseJsonResponse, type ApiErrorBody } from "./api-client";

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
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; body: ApiErrorBody | null }> {
  const response = await fetch(path, {
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

export async function createAlbum(input: {
  title: string;
  themeId: string;
}): Promise<{ ok: true; album: AlbumSummary } | { ok: false; status: number; message: string }> {
  const result = await apiFetch<{ album?: AlbumSummary }>("/api/v1/albums", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!result.ok) {
    return { ok: false, status: result.status, message: apiMessage(result.body) };
  }
  if (!result.data.album) {
    return { ok: false, status: 500, message: "响应不完整" };
  }
  return { ok: true, album: result.data.album };
}

export async function getAlbum(
  albumId: string,
): Promise<
  | { ok: true; album: AlbumSummary; assetIds: string[] }
  | { ok: false; status: number; message: string }
> {
  const result = await apiFetch<{ album?: AlbumSummary; assets?: { assetId?: string }[] }>(
    `/api/v1/albums/${encodeURIComponent(albumId)}`,
  );
  if (!result.ok) {
    return { ok: false, status: result.status, message: apiMessage(result.body) };
  }
  if (!result.data.album) {
    return { ok: false, status: 500, message: "响应不完整" };
  }
  const assetIds = (result.data.assets ?? [])
    .map((asset) => asset.assetId)
    .filter((id): id is string => typeof id === "string");
  return { ok: true, album: result.data.album, assetIds };
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
