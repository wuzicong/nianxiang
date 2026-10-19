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
import { AlbumAssetGrid } from "../album-asset-grid";
import { AlbumShareList } from "../album-share-list";
import { CreateShareForm } from "../create-share-form";
import { UploadPhotos } from "../upload-photos";

export default function AlbumDetailPage() {
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

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <Link href="/">念册</Link>
        {" · "}
        <Link href="/albums">相册</Link>
      </p>
      {album ? (
        <>
          <h1 style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>{album.title}</h1>
          <p style={{ lineHeight: 1.6, color: "#555" }}>
            主题：{skin?.name} · 已收录 {assets.length} 张。这里和分享页只显示预览，不展示原图。
          </p>
          <p style={{ lineHeight: 1.6 }}>
            <Link href={`/albums/${album.albumId}/preview`}>按主题看这本相册</Link>
            <span style={{ color: "#777" }}> · 故事或翻页，只用预览图</span>
          </p>
          {processing ? (
            <p style={{ lineHeight: 1.6, color: "#555" }}>
              有照片正在生成预览。完成后会显示缩略图；已经打开的分享页需要刷新。
            </p>
          ) : null}
          {assets.length > 0 ? (
            <p style={{ color: "#777", fontSize: 14 }}>预览地址大约 15 分钟内有效，停留在此页时会自动更换。</p>
          ) : null}
        </>
      ) : (
        <h1 style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>相册</h1>
      )}
      {message === "请先登录。" ? (
        <p style={{ lineHeight: 1.6, color: "#555" }}>
          请先<Link href="/login">登录</Link>。
        </p>
      ) : message ? (
        <p style={{ lineHeight: 1.6, color: "#555" }}>{message}</p>
      ) : null}

      {album && skin ? (
        <>
          <AlbumAssetGrid
            assets={assets}
            onPreviewError={onPreviewError}
            uploadAnchorId="album-upload"
          />
          <div id="album-upload">
            <UploadPhotos
              target={{ kind: "album", albumId: album.albumId }}
              theme={skin}
              assets={assets}
              albumEmpty={assets.length === 0}
              onUploaded={() => void refresh("silent")}
            />
          </div>
          <div id="album-create-share">
            <CreateShareForm albumId={album.albumId} theme={skin} onCreated={() => void refreshShares()} />
          </div>
          <AlbumShareList shares={shares} revokingId={revokingId} onRevoke={(shareId) => void revoke(shareId)} />
        </>
      ) : null}
    </main>
  );
}
