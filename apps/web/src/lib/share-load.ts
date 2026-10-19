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
  | { kind: "limited" }
  | { kind: "locked"; themeId: string | null }
  | { kind: "ok"; share: PublicSharePayload };

/** 错密码、撤销、过期共用这一句，不要改语义。 */
export const UNLOCK_FAILED = "无法打开分享。请确认密码；链接撤销或过期时也是这句话。";

export const SHARE_RATE_LIMIT_TITLE = "请求太频繁";
export const SHARE_RATE_LIMIT_BODY = "请稍后再试。这不是链接失效，相册也还在。";
export const UNLOCK_RATE_LIMIT =
  "请求太频繁，请稍后再试。解锁大约每分钟 6 次，先等一会儿，不要连续点击。";

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

/**
 * 把公开分享的 HTTP 状态收成页面分支。429 单独成限流，不能并进不存在。
 * forceStatus 走同一条分类，不另开一套文案。
 */
export async function classifyPublicShare(
  status: number,
  readJson: () => Promise<unknown>,
  isThemeId: (value: string) => boolean,
): Promise<ShareLoad> {
  if (status === 429) return { kind: "limited" };
  if (status >= 500) return { kind: "unavailable" };
  if (status === 401) {
    try {
      const body = (await readJson()) as { error?: unknown; themeId?: unknown };
      if (body && typeof body === "object" && body.error === "password_required") {
        const themeId = typeof body.themeId === "string" && isThemeId(body.themeId) ? body.themeId : null;
        return { kind: "locked", themeId };
      }
    } catch {
      return { kind: "missing" };
    }
    return { kind: "missing" };
  }
  if (status < 200 || status >= 300) return { kind: "missing" };
  try {
    const share = parsePublicSharePayload(await readJson());
    if (!share) return { kind: "unavailable" };
    return { kind: "ok", share };
  } catch {
    return { kind: "unavailable" };
  }
}

/** 服务端拉取公开分享。不转发 Cookie。令牌是否合法、主题是否认识由调用方判断。 */
export async function loadPublicShareFrom(input: {
  tokenOk: boolean;
  forceStatus?: number;
  isThemeId: (value: string) => boolean;
  fetchShare: () => Promise<Response>;
}): Promise<ShareLoad> {
  if (!input.tokenOk) return { kind: "missing" };
  if (input.forceStatus !== undefined) {
    return classifyPublicShare(input.forceStatus, async () => null, input.isThemeId);
  }
  let response: Response;
  try {
    response = await input.fetchShare();
  } catch {
    return { kind: "unavailable" };
  }
  return classifyPublicShare(response.status, () => response.json(), input.isThemeId);
}
