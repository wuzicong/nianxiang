"use client";

import { useEffect, useRef } from "react";
import type { ThemeSkin } from "../../lib/themes";
import type { PublicShareAsset, PublicSharePayload } from "../../lib/share";
import { shareThemeStyle } from "./share-chrome";

function imageUrl(asset: PublicShareAsset): string | null {
  return (
    asset.derivatives.preview?.url ??
    asset.derivatives.hero?.url ??
    asset.derivatives.thumb?.url ??
    null
  );
}

export function ShareGallery({
  share,
  theme,
  refreshHint,
  focusTitleOnMount,
}: {
  share: PublicSharePayload;
  theme: ThemeSkin;
  refreshHint?: string;
  focusTitleOnMount?: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusTitleOnMount) titleRef.current?.focus();
  }, [focusTitleOnMount]);

  const defaultRefresh = "刷新页面即可继续查看。";
  const mergedNote =
    refreshHint === undefined
      ? `只读分享。图片地址大约 15 分钟内有效。${defaultRefresh}`
      : "只读分享。图片地址大约 15 分钟内有效。";

  return (
    <main
      className="share-gallery"
      data-share-state="open"
      data-theme={theme.id}
      style={shareThemeStyle(theme)}
    >
      <article className="share-gallery-inner">
        <p className="share-gallery-brand">
          <a href="/">念册</a>
        </p>
        <p className="share-gallery-kicker">{theme.name}</p>
        <div className="share-gallery-title-block">
          {theme.id === "cotton-candy" ? (
            <span className="share-gallery-sparkle" aria-hidden="true" />
          ) : null}
          <h1 ref={titleRef} tabIndex={-1} className="share-gallery-title">
            {share.album.title}
          </h1>
        </div>
        <p className="share-gallery-note">{mergedNote}</p>
        {refreshHint ? <p className="share-gallery-refresh">{refreshHint}</p> : null}
        {share.assets.length === 0 ? (
          <p className="share-gallery-empty">这本相册还没有照片。</p>
        ) : (
          <ul className="share-gallery-grid">
            {share.assets.map((asset) => {
              const src = imageUrl(asset);
              const caption = asset.filename?.trim() ? asset.filename : "照片";
              return (
                <li key={asset.assetId} className="share-gallery-card">
                  {src ? (
                    <img
                      src={src}
                      alt={caption}
                      referrerPolicy="no-referrer"
                      className="share-gallery-photo"
                    />
                  ) : (
                    <div className="share-gallery-photo share-gallery-photo--placeholder">暂无预览</div>
                  )}
                  <p className="share-gallery-caption">{caption}</p>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </main>
  );
}
