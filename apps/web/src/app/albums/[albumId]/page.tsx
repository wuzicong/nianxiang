"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { albumRefreshDelay, type AlbumAssetView } from "../../../lib/album-assets";
import {
  getAlbum,
  listShares,
  revokeShare,
  type AlbumSummary,
  type ShareSummary,
} from "../../../lib/albums-api";
import { themeSkin } from "../../../lib/themes";
import { useSessionEmail } from "../../../lib/use-session-email";
import { MemoraShell } from "../../shell/memora-shell";
import { shareThemeStyle } from "../../s/share-chrome";
import "../album-share.css";
import { AlbumAssetGrid } from "../album-asset-grid";
import { AlbumShareList } from "../album-share-list";
import { CreateShareForm } from "../create-share-form";
import { UploadPhotos } from "../upload-photos";

export default function AlbumDetailPage() {
  const sessionEmail = useSessionEmail();
  const params = useParams<{ albumId: string }>();
  const albumId = params.albumId;
  const [album, setAlbum] = useState<AlbumSummary | null>(null);
  const [assets, setAssets] = useState<AlbumAssetView[]>([]);
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [message, setMessage] = useState("正在加载…");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const brokenPreviews = useRef(new Set<string>());

  const refreshShares = useCallback(async () => {
    const listed = await listShares(albumId);
    if (listed.ok) setShares(listed.shares);
  }, [albumId]);

  const refresh = useCallback(
    async (mode: "initial" | "silent") => {
      try {
        const detail = await getAlbum(albumId);
        if (!detail.ok && detail.status === 401) {
          setAlbum(null);
          setAssets([]);
          setMessage("请先登录。");
          return;
        }
        if (!detail.ok) {
          if (mode === "initial") {
            setMessage(detail.message);
            setAlbum(null);
            setAssets([]);
          }
          return;
        }
        setAlbum(detail.album);
        setAssets(detail.assets);
        if (mode === "initial") setMessage("");
        if (mode === "initial") await refreshShares();
      } catch {
        if (mode === "initial") setMessage("API 暂时不可达");
      }
    },
    [albumId, refreshShares],
  );

  useEffect(() => {
    void refresh("initial");
  }, [refresh]);

  useEffect(() => {
    if (!album) return;
    const delay = albumRefreshDelay(assets);
    if (delay === null) return;
    const timer = window.setTimeout(() => {
      void refresh("silent");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [album, assets, refresh]);

  function onPreviewError(src: string) {
    if (brokenPreviews.current.has(src)) return;
    brokenPreviews.current.add(src);
    void refresh("silent");
  }

  async function revoke(shareId: string) {
    setRevokingId(shareId);
    setMessage("正在撤销…");
    const result = await revokeShare(shareId);
    setRevokingId(null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage("分享已撤销。");
    await refreshShares();
  }

  const skin = album ? themeSkin(album.themeId) : null;
  const processing = assets.some(
    (asset) => asset.status === "pending_upload" || asset.status === "uploaded" || asset.status === "processing",
  );
  const busy = message === "正在加载…" || message === "正在撤销…";
  const showRetry = !album && !busy && message !== "请先登录。" && message.length > 0;
  const needsLogin = message === "请先登录。";

  const pageTitle = album?.title ?? "相册";
  const lede = album && skin
    ? `${skin.name} · ${assets.length} 张 · 这里和分享页只显示预览，不展示原图。`
    : undefined;

  return (
    <MemoraShell
      active="albums"
      title={pageTitle}
      lede={lede}
      status={message || undefined}
      statusRole={showRetry || needsLogin ? "alert" : "status"}
      userEmail={sessionEmail}
      privacyBadge="相册默认私密"
    >
      {album ? (
        <p className="shell-muted shell-back">
          <Link className="lib-quiet" href="/albums">返回相册列表</Link>
        </p>
      ) : null}

      {album && skin ? (
        <p className="shell-preview-link">
          <Link className="lib-quiet" href={`/albums/${album.albumId}/preview`}>按主题看这本相册</Link>
        </p>
      ) : null}

      {album && processing ? (
        <p className="shell-muted">有照片正在生成预览…</p>
      ) : null}

      {album && assets.length > 0 ? (
        <p className="shell-muted" style={{ fontSize: "0.88rem" }}>
          预览地址大约 15 分钟内有效，停留在此页时会自动更换。
        </p>
      ) : null}

      {needsLogin ? (
        <p className="shell-inline-links">
          请先<Link href={`/login?next=/albums/${albumId}`}>登录</Link>。
        </p>
      ) : null}

      {showRetry ? (
        <div className="shell-actions">
          <button type="button" className="lib-primary" onClick={() => void refresh("initial")}>重试</button>
        </div>
      ) : null}

      {album && skin ? (
        <>
          <section className="shell-section" aria-labelledby="album-photos-heading">
            <h2 id="album-photos-heading">照片</h2>
            <AlbumAssetGrid
              assets={assets}
              onPreviewError={onPreviewError}
              uploadAnchorId="album-upload"
            />
          </section>
          <section className="shell-section" id="album-upload" aria-labelledby="album-upload-heading">
            <h2 id="album-upload-heading">上传</h2>
            <p>把新照片放进这本相册；上传后会自动排队生成预览。</p>
            <UploadPhotos
              target={{ kind: "album", albumId: album.albumId }}
              theme={skin}
              assets={assets}
              albumEmpty={assets.length === 0}
              onUploaded={() => void refresh("silent")}
            />
          </section>
          <section className="shell-section" id="album-create-share" aria-labelledby="album-share-heading">
            <h2 id="album-share-heading">分享</h2>
            <p>生成可撤销的链接；可选密码保护。</p>
            <CreateShareForm albumId={album.albumId} theme={skin} onCreated={() => void refreshShares()} />
          </section>
          <section className="shell-section" aria-labelledby="album-shares-heading">
            <h2 id="album-shares-heading" className="lib-sr">已有分享</h2>
            <div
              className="share-shell album-share-list-shell"
              data-theme={skin.id}
              style={shareThemeStyle(skin)}
            >
              <AlbumShareList
                shares={shares}
                revokingId={revokingId}
                onRevoke={(shareId) => void revoke(shareId)}
              />
            </div>
          </section>
        </>
      ) : null}
    </MemoraShell>
  );
}
