"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { albumRefreshDelay, visibleMessage, type AlbumAssetView } from "../../../../lib/album-assets";
import { albumTheme, resolveAlbumLayout, type AlbumTheme } from "../../../../lib/album-theme";
import { getAlbum } from "../../../../lib/albums-api";
import { buildOwnedAlbum, type OwnedAlbumFill } from "../../../../lib/owned-album";
import { AlbumStage } from "../../../preview/album-stage";

export function OwnedAlbumStage({
  albumId,
  requestedLayout,
  decorationsByTheme,
}: {
  albumId: string;
  requestedLayout: string | null;
  decorationsByTheme: Record<string, Record<string, string>>;
}) {
  const [theme, setTheme] = useState<AlbumTheme | null>(null);
  const [filled, setFilled] = useState<OwnedAlbumFill | null>(null);
  const [assets, setAssets] = useState<AlbumAssetView[]>([]);
  const [message, setMessage] = useState("正在打开这本相册…");
  const [status, setStatus] = useState<number | null>(null);
  const brokenPreviews = useRef(new Set<string>());

  const refresh = useCallback(
    async (mode: "initial" | "silent") => {
      try {
        const detail = await getAlbum(albumId);
        if (!detail.ok) {
          if (mode === "initial" || detail.status === 401) {
            setTheme(null);
            setFilled(null);
            setAssets([]);
            setStatus(detail.status);
            setMessage(detail.status === 401 ? "请先登录。" : visibleMessage(detail.message, "打不开这本相册"));
          }
          return;
        }
        const nextTheme = albumTheme(detail.album.themeId);
        if (!nextTheme) {
          setTheme(null);
          setFilled(null);
          setStatus(200);
          setMessage("这本相册的主题还不能排成册。");
          return;
        }
        setTheme(nextTheme);
        setFilled(buildOwnedAlbum(nextTheme, { title: detail.album.title, assets: detail.assets }));
        setAssets(detail.assets);
        setStatus(200);
        if (mode === "initial") setMessage("");
      } catch {
        if (mode === "initial") {
          setStatus(null);
          setMessage("API 暂时不可达");
        }
      }
    },
    [albumId],
  );

  useEffect(() => {
    void refresh("initial");
  }, [refresh]);

  useEffect(() => {
    if (!theme) return;
    const delay = albumRefreshDelay(assets);
    if (delay === null) return;
    const timer = window.setTimeout(() => {
      void refresh("silent");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [assets, refresh, theme]);

  const onPhotoError = useCallback((src: string) => {
    if (brokenPreviews.current.has(src)) return;
    brokenPreviews.current.add(src);
    void refresh("silent");
  }, [refresh]);

  if (!theme || !filled) {
    return (
      <main className="preview-index">
        <p className="preview-index-crumb">
          <Link href="/">念册</Link>
          {" · "}
          <Link href="/albums">相册</Link>
        </p>
        <h1>成册预览</h1>
        <p className="preview-index-lead">
          {status === 401 ? (
            <>
              请先<Link href="/login">登录</Link>，再打开这本相册。
            </>
          ) : (
            message
          )}
        </p>
        <p className="preview-index-lead">
          <Link href="/albums">返回相册</Link>
          {" · "}
          <Link href="/preview">先看主题样张</Link>
        </p>
      </main>
    );
  }

  return (
    <AlbumStage
      theme={theme}
      album={filled.album}
      decorations={decorationsByTheme[theme.skin.id] ?? {}}
      initialLayout={resolveAlbumLayout(theme, requestedLayout)}
      onPhotoError={onPhotoError}
      source={{
        kind: "owned",
        albumId,
        placed: filled.placed,
        ready: filled.ready,
        pending: filled.pending,
        unavailable: filled.unavailable,
      }}
    />
  );
}
