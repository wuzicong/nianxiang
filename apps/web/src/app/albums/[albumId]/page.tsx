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
import { CreateShareForm } from "../create-share-form";
import { UploadPhotos } from "../upload-photos";

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export default function AlbumDetailPage() {
  const params = useParams<{ albumId: string }>();
  const albumId = params.albumId;
  const [album, setAlbum] = useState<AlbumSummary | null>(null);
  const [assets, setAssets] = useState<AlbumAssetView[]>([]);
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [message, setMessage] = useState("正在加载…");
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
    setMessage("正在撤销…");
    const result = await revokeShare(shareId);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage("分享已撤销。");
    await refreshShares();
  }

  const activeShares = shares.filter((share) => share.revokedAt === null);
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
            主题：{themeSkin(album.themeId).name} · 已收录 {assets.length} 张。这里和分享页只显示预览，不展示原图。
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

      {album ? (
        <>
          <AlbumAssetGrid assets={assets} onPreviewError={onPreviewError} />
          <UploadPhotos albumId={album.albumId} onUploaded={() => void refresh("silent")} />
          <CreateShareForm albumId={album.albumId} onCreated={() => void refreshShares()} />

          <section style={{ marginTop: "2.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>分享记录</h2>
            {activeShares.length === 0 ? (
              <p style={{ color: "#555" }}>还没有有效分享。</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, marginTop: "1rem" }}>
                {activeShares.map((share) => (
                  <li
                    key={share.shareId}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 8,
                      padding: "0.75rem 1rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <p style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                      {share.shareId}
                    </p>
                    <p style={{ margin: "0.35rem 0 0", fontSize: 14, color: "#555" }}>
                      创建于 {formatTime(share.createdAt)}
                      {share.expiresAt ? ` · 过期 ${formatTime(share.expiresAt)}` : " · 不过期"}
                      {share.passwordProtected ? " · 有密码" : " · 无密码"}
                    </p>
                    <button type="button" style={{ marginTop: "0.5rem" }} onClick={() => void revoke(share.shareId)}>
                      撤销
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
