import { isShareToken, isThemeId } from "@memora/shared";
import { apiOrigin } from "./api-origin";
import { parsePublicSharePayload, type ShareLoad } from "./share";

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
