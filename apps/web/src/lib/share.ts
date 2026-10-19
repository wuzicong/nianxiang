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
} from "./share-load";
export type { PublicDerivative, PublicShareAsset, PublicSharePayload, ShareLoad } from "./share-load";

/** 服务端拉取公开分享。不转发 Cookie，失败时也不把 token 写进日志。 */
export async function loadPublicShare(token: string, forceStatus?: number) {
  return loadPublicShareFrom({
    tokenOk: isShareToken(token),
    forceStatus,
    isThemeId,
    fetchShare: () =>
      fetch(`${apiOrigin()}/api/v1/public/shares/${encodeURIComponent(token)}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      }),
  });
}
