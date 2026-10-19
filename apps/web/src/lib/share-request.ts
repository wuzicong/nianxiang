import { cache } from "react";
import { headers } from "next/headers";
import { loadPublicShare } from "./share";
import { forcedPublicShareStatus } from "./share-status-hook";

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}

const loadCached = cache((token: string, smoke: string, forwardedFor: string) =>
  loadPublicShare(token, forcedPublicShareStatus(smoke || undefined), forwardedFor || undefined),
);

/** 元数据和页面共用一次读取，避免一次打开分享扣两次公开额度。 */
export async function loadSharePage(token: string, smoke: string | string[] | undefined) {
  const forwarded = ((await headers()).get("x-forwarded-for") ?? "").slice(0, 512);
  return loadCached(token, first(smoke), forwarded);
}
