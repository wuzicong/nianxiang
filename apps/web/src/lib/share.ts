import { isShareToken, isThemeId } from "@memora/shared";
import { apiOrigin } from "./api-origin";
import { loadPublicShareFrom } from "./share-load";

export {
  SHARE_RATE_LIMIT_BODY,
  SHARE_RATE_LIMIT_TITLE,
  UNLOCK_FAILED,
  UNLOCK_RATE_LIMIT,
  classifyPublicShare,
  parsePublicSharePayload,
  parseRetryAfterSeconds,
} from "./share-load";
export type { PublicDerivative, PublicShareAsset, PublicSharePayload, ShareLoad } from "./share-load";

const FORWARDED_FOR = /^[0-9a-fA-F:., \t]+$/;

/** 服务端拉取公开分享。不转发 Cookie，失败时也不把 token 写进日志。 */
export async function loadPublicShare(
  token: string,
  forceStatus?: number,
  forwardedFor?: string,
) {
  const headers: Record<string, string> = { accept: "application/json" };
  if (
    forwardedFor &&
    forwardedFor.length <= 512 &&
    !/[\r\n]/.test(forwardedFor) &&
    FORWARDED_FOR.test(forwardedFor)
  ) {
    headers["x-forwarded-for"] = forwardedFor;
  }
  return loadPublicShareFrom({
    tokenOk: isShareToken(token),
    forceStatus,
    isThemeId,
    fetchShare: () =>
      fetch(`${apiOrigin()}/api/v1/public/shares/${encodeURIComponent(token)}`, {
        cache: "no-store",
        headers,
        signal: AbortSignal.timeout(8_000),
      }),
  });
}
