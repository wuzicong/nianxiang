import { isShareToken, isThemeId } from "@memora/shared";
import { apiOrigin } from "./api-origin";

export interface PublicDerivative {
  url: string;
  expiresAt: string;
}

export interface PublicShareAsset {
  assetId: string;
  filename: string;
  width: number | null;
  height: number | null;
  derivatives: Partial<Record<"thumb" | "preview" | "hero", PublicDerivative>>;
}

export interface PublicSharePayload {
  album: { title: string; themeId: string };
  assets: PublicShareAsset[];
}

export type ShareLoad =
  | { kind: "missing" }
  | { kind: "unavailable" }
  | { kind: "locked"; themeId: string | null }
  | { kind: "ok"; share: PublicSharePayload };

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8 || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parsePublicSharePayload(value: unknown): PublicSharePayload | null {
  if (!value || typeof value !== "object") return null;
  const album = (value as { album?: { title?: unknown; themeId?: unknown } }).album;
  const assets = (value as { assets?: unknown }).assets;
  if (!album || typeof album.title !== "string" || typeof album.themeId !== "string") return null;
  if (album.title.length > 80) return null;
  if (!Array.isArray(assets)) return null;
  const parsed: PublicShareAsset[] = [];
  for (const item of assets) {
    if (!item || typeof item !== "object") return null;
    const row = item as {
      assetId?: unknown;
      filename?: unknown;
      width?: unknown;
      height?: unknown;
      derivatives?: unknown;
    };
    if (typeof row.assetId !== "string" || typeof row.filename !== "string") return null;
    const derivatives: PublicShareAsset["derivatives"] = {};
    const raw = row.derivatives;
    if (raw && typeof raw === "object") {
      for (const size of ["thumb", "preview", "hero"] as const) {
        const entry = (raw as Record<string, { url?: unknown; expiresAt?: unknown } | undefined>)[size];
        const url = httpUrl(entry?.url);
        if (!url || typeof entry?.expiresAt !== "string") continue;
        derivatives[size] = { url, expiresAt: entry.expiresAt };
      }
    }
    parsed.push({
      assetId: row.assetId,
      filename: row.filename,
      width: typeof row.width === "number" ? row.width : null,
      height: typeof row.height === "number" ? row.height : null,
      derivatives,
    });
  }
  return { album: { title: album.title, themeId: album.themeId }, assets: parsed };
}

/** 服务端拉取公开分享。不转发 Cookie，失败时也不把 token 写进日志。 */
export async function loadPublicShare(token: string): Promise<ShareLoad> {
  if (!isShareToken(token)) return { kind: "missing" };
  let response: Response;
  try {
    response = await fetch(`${apiOrigin()}/api/v1/public/shares/${encodeURIComponent(token)}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (response.status >= 500) return { kind: "unavailable" };
  if (response.status === 401) {
    try {
      const body = (await response.json()) as { error?: unknown; themeId?: unknown };
      if (body.error === "password_required") {
        const themeId = typeof body.themeId === "string" && isThemeId(body.themeId) ? body.themeId : null;
        return { kind: "locked", themeId };
      }
    } catch {
      return { kind: "missing" };
    }
    return { kind: "missing" };
  }
  if (!response.ok) return { kind: "missing" };
  try {
    const share = parsePublicSharePayload(await response.json());
    if (!share) return { kind: "unavailable" };
    return { kind: "ok", share };
  } catch {
    return { kind: "unavailable" };
  }
}
