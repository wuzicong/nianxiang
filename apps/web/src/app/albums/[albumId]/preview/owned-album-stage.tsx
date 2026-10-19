"use client";

import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "@memora/shared";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { albumRefreshDelay, visibleMessage, type AlbumAssetView } from "../../../../lib/album-assets";
import { albumTheme, resolveAlbumLayout, type AlbumTheme } from "../../../../lib/album-theme";
import { getAlbum } from "../../../../lib/albums-api";
import { buildOwnedAlbum, type OwnedAlbumFill } from "../../../../lib/owned-album";
import { themeSkin } from "../../../../lib/themes";
import { shareThemeStyle } from "../../../s/share-chrome";
import { AlbumStage } from "../../../preview/album-stage";

function albumShareHref(albumId: string): string {
  return `/albums/${encodeURIComponent(albumId)}#album-create-share`;
}

function OwnedPreviewChrome({
  albumId,
  themeId,
  albumTitle,
  focusTitleOnMount,
  showShareCta = true,
  showLoginCta = false,
  children,
}: {
  albumId: string;
  themeId: ThemeId;
  albumTitle?: string | null;
  focusTitleOnMount?: boolean;
  showShareCta?: boolean;
  showLoginCta?: boolean;
  children: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skin = themeSkin(themeId);
  const style = shareThemeStyle(skin) as CSSProperties;
  const heading = albumTitle?.trim() || "成册预览";

  useEffect(() => {
    if (!focusTitleOnMount) return;
    titleRef.current?.focus({ preventScroll: true });
  }, [focusTitleOnMount, heading]);

  return (
    <main
      className="share-shell preview-owned-shell"
      data-theme={skin.id}
      style={style}
    >
      <p className="preview-owned-crumb toolbar-brand">
        <Link href="/">念册</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/albums">相册</Link>
      </p>
      <h1 className="preview-owned-title" tabIndex={-1} ref={titleRef}>
        {heading}
      </h1>
      <div className="preview-owned-body">{children}</div>
      <div className="preview-owned-actions">
        {showShareCta ? (
          <Link className="preview-owned-primary" href={albumShareHref(albumId)}>
            生成分享链接
          </Link>
        ) : showLoginCta ? (
          <Link className="preview-owned-primary" href="/login">
            登录
          </Link>
        ) : null}
        <Link
          className={showShareCta || showLoginCta ? "preview-owned-secondary" : "preview-owned-primary"}
          href={`/albums/${encodeURIComponent(albumId)}`}
        >
          返回这本
        </Link>
      </div>
    </main>
  );
}

export function OwnedAlbumStage({
  albumId,
  requestedLayout,
  decorationsByTheme,
  focusTitleOnMount = false,
}: {
  albumId: string;
  requestedLayout: string | null;
  decorationsByTheme: Record<string, Record<string, string>>;
  focusTitleOnMount?: boolean;
}) {
  const [theme, setTheme] = useState<AlbumTheme | null>(null);
  const [shellThemeId, setShellThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [albumTitle, setAlbumTitle] = useState<string | null>(null);
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
            setAlbumTitle(null);
            setStatus(detail.status);
            setMessage(detail.status === 401 ? "请先登录。" : visibleMessage(detail.message, "打不开这本相册"));
          }
          if (mode === "initial") setFetching(false);
          return;
        }
        setAlbumTitle(detail.album.title);
        setShellThemeId(isThemeId(detail.album.themeId) ? detail.album.themeId : DEFAULT_THEME_ID);
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

  const chrome = (
    body: ReactNode,
    options?: { focusTitle?: boolean; showShareCta?: boolean; showLoginCta?: boolean },
  ) => (
    <OwnedPreviewChrome
      albumId={albumId}
      themeId={shellThemeId}
      albumTitle={albumTitle}
      focusTitleOnMount={options?.focusTitle ?? focusTitleOnMount}
      showShareCta={options?.showShareCta ?? true}
      showLoginCta={options?.showLoginCta ?? false}
    >
      {body}
    </OwnedPreviewChrome>
  );

  if (fetching) {
    return chrome(
      <p className="preview-owned-status" role="status" aria-busy="true">
        <span className="preview-owned-spinner" aria-hidden="true" />
        正在读取相册和预览图…
      </p>,
    );
  }

  if (!theme || !filled) {
    return chrome(
      <p className="preview-owned-lead">
        {status === 401 ? (
          <>
            请先<Link href="/login">登录</Link>，再打开这本相册。
          </>
        ) : (
          message
        )}
      </p>,
      { showShareCta: false, showLoginCta: status === 401 },
    );
  }

  if (filled.ready === 0 && filled.pending > 0) {
    return chrome(
      <>
        <p className="preview-owned-status" role="status" aria-busy="true">
          <span className="preview-owned-spinner" aria-hidden="true" />
          {filled.pending} 张照片正在生成预览，好了会自动排进册子。
        </p>
        <p className="preview-owned-lead">可以先回到相册继续上传，或稍后再打开本页。</p>
      </>,
    );
  }

  if (filled.ready === 0) {
    const extra =
      filled.unavailable > 0 ? `其中 ${filled.unavailable} 张没有可用预览，请到相册查看处理状态。` : null;
    return chrome(
      <>
        <p className="preview-owned-lead">
          这本相册里还没有可排进册子的预览图。上传照片后，系统会生成预览图（不是原图），才能在这里成册浏览。
        </p>
        {extra ? <p className="preview-owned-lead">{extra}</p> : null}
        <p className="preview-owned-inline-cta">
          <Link className="preview-owned-secondary" href={`/albums/${encodeURIComponent(albumId)}`}>
            去相册上传照片
          </Link>
        </p>
      </>,
    );
  }

  return (
    <AlbumStage
      theme={theme}
      album={filled.album}
      decorations={decorationsByTheme[theme.skin.id] ?? {}}
      initialLayout={resolveAlbumLayout(theme, requestedLayout)}
      onPhotoError={onPhotoError}
      focusTitleOnMount={focusTitleOnMount}
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
