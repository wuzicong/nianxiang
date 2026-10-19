"use client";

import { useMemo } from "react";
import type { ShareSummary } from "../../lib/albums-api";
import { SHARE_STATUS_LABEL, shareLifecycleStatus } from "../../lib/share-lifecycle";

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export function AlbumShareList({
  shares,
  revokingId,
  onRevoke,
}: {
  shares: ShareSummary[];
  revokingId: string | null;
  onRevoke: (shareId: string) => void;
}) {
  const sorted = useMemo(
    () => [...shares].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [shares],
  );

  if (sorted.length === 0) {
    return (
      <section className="album-share-list-section" aria-labelledby="album-share-list-title">
        <h2 id="album-share-list-title">分享记录</h2>
        <p style={{ marginTop: "0.75rem", color: "#6b6560", lineHeight: 1.6 }}>还没有分享链接。</p>
      </section>
    );
  }

  return (
    <section className="album-share-list-section" aria-labelledby="album-share-list-title">
      <h2 id="album-share-list-title">分享记录</h2>
      <p style={{ margin: "0.45rem 0 0", fontSize: "0.88rem", color: "#6b6560", lineHeight: 1.55 }}>
        列表不显示密码或完整链接。已撤销或已过期的链接无法再打开。
      </p>
      <ul className="album-share-list">
        {sorted.map((share) => {
          const status = shareLifecycleStatus(share);
          const canRevoke = status === "active";
          return (
            <li key={share.shareId} className="album-share-list-item">
              <p className="album-share-list-id">{share.shareId}</p>
              <p className="album-share-list-meta">
                <span
                  className="album-share-status"
                  data-status={status}
                  aria-label={`状态：${SHARE_STATUS_LABEL[status]}`}
                >
                  {SHARE_STATUS_LABEL[status]}
                </span>
                {" · "}
                创建于 {formatTime(share.createdAt)}
                {share.expiresAt ? ` · 失效 ${formatTime(share.expiresAt)}` : " · 不过期"}
                {share.passwordProtected ? " · 有密码保护" : " · 无密码"}
              </p>
              {canRevoke ? (
                <button
                  type="button"
                  className="album-share-revoke-btn"
                  disabled={revokingId === share.shareId}
                  onClick={() => onRevoke(share.shareId)}
                >
                  {revokingId === share.shareId ? "正在撤销…" : "撤销此链接"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
