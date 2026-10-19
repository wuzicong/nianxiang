import type { ShareSummary } from "./albums-api";

export type ShareLifecycleStatus = "active" | "expired" | "revoked";

export function shareLifecycleStatus(share: ShareSummary, nowMs = Date.now()): ShareLifecycleStatus {
  if (share.revokedAt !== null) return "revoked";
  if (share.expiresAt) {
    const expiresMs = new Date(share.expiresAt).getTime();
    if (!Number.isNaN(expiresMs) && expiresMs <= nowMs) return "expired";
  }
  return "active";
}

export const SHARE_STATUS_LABEL: Record<ShareLifecycleStatus, string> = {
  active: "有效",
  expired: "已过期",
  revoked: "已撤销",
};
