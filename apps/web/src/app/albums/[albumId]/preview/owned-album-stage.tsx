"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { albumRefreshDelay, visibleMessage, type AlbumAssetView } from "../../../../lib/album-assets";
import { albumTheme, resolveAlbumLayout, type AlbumTheme } from "../../../../lib/album-theme";
import { getAlbum } from "../../../../lib/albums-api";
import { buildOwnedAlbum, type OwnedAlbumFill } from "../../../../lib/owned-album";
import { AlbumStage } from "../../../preview/album-stage";

function OwnedPreviewChrome({
  albumId,
  children,
}: {
  albumId: string;
  children: ReactNode;
}) {
  return (
    <main className="preview-index preview-owned-shell">
      <p className="preview-index-crumb">
        <Link href="/">念册</Link>
        {" · "}
        <Link href="/albums">相册</Link>
      </p>
      <h1>成册预览</h1>
      <div className="preview-owned-body">{children}</div>
      <p className="preview-index-lead preview-owned-foot">
        <Link href={`/albums/${encodeURIComponent(albumId)}`}>回到这本相册</Link>
        {" · "}
        <Link href="/preview">先看主题样张</Link>
      </p>
    </main>
  );
}

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
  const [fetching, setFetching] = useState(true);
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
          if (mode === "initial") setFetching(false);
          return;
        }
        const nextTheme = albumTheme(detail.album.themeId);
        if (!nextTheme) {
          setTheme(null);
          setFilled(null);
          setStatus(200);
          setMessage("这本相册的主题还不能排成册。");
          if (mode === "initial") setFetching(false);
          return;
        }
        setTheme(nextTheme);
        setFilled(buildOwnedAlbum(nextTheme, { title: detail.album.title, assets: detail.assets }));
        setAssets(detail.assets);
        setStatus(200);
        if (mode === "initial") {
          setMessage("");
          setFetching(false);
        }
      } catch {
        if (mode === "initial") {
          setStatus(null);
          setMessage("API 暂时不可达");
          setFetching(false);
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

  if (fetching) {
    return (
      <OwnedPreviewChrome albumId={albumId}>
        <p className="preview-owned-status" role="status" aria-busy="true">
          <span className="preview-owned-spinner" aria-hidden="true" />
          正在读取相册和预览图…
        </p>
      </OwnedPreviewChrome>
    );
  }

  if (!theme || !filled) {
    return (
      <OwnedPreviewChrome albumId={albumId}>
        <p className="preview-index-lead">
          {status === 401 ? (
            <>
              请先<Link href="/login">登录</Link>，再打开这本相册。
            </>
          ) : (
            message
          )}
        </p>
      </OwnedPreviewChrome>
    );
  }

  if (filled.ready === 0 && filled.pending > 0) {
    return (
      <OwnedPreviewChrome albumId={albumId}>
        <p className="preview-owned-status" role="status" aria-busy="true">
          <span className="preview-owned-spinner" aria-hidden="true" />
          {filled.pending} 张照片正在生成预览，好了会自动排进册子。
        </p>
        <p className="preview-index-lead">可以先回到相册继续上传，或稍后再打开本页。</p>
      </OwnedPreviewChrome>
    );
  }

  if (filled.ready === 0) {
    const extra =
      filled.unavailable > 0 ? `其中 ${filled.unavailable} 张没有可用预览，请到相册查看处理状态。` : null;
    return (
      <OwnedPreviewChrome albumId={albumId}>
        <p className="preview-index-lead">
          这本相册里还没有可排进册子的预览图。上传照片后，系统会生成预览图（不是原图），才能在这里成册浏览。
        </p>
        {extra ? <p className="preview-index-lead">{extra}</p> : null}
        <p className="preview-owned-cta">
          <Link className="preview-owned-upload-link" href={`/albums/${encodeURIComponent(albumId)}`}>
            去相册上传照片
          </Link>
        </p>
      </OwnedPreviewChrome>
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
