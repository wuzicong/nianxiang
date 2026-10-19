"use client";

import { THEME_IDS } from "@memora/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { albumFontFaces, albumTheme, resolveAlbumLayout, type AlbumLayoutMode, type AlbumTheme } from "../../lib/album-theme";
import type { DemoAlbum } from "../../lib/album-demo";
import { buttonInk, shareThemeStyle } from "../s/share-chrome";
import { FlipBook, type FlipApi } from "./flip-book";
import { SlotSheet, SvgMark } from "./slot-sheet";

function albumShareHref(albumId: string): string {
  return `/albums/${encodeURIComponent(albumId)}#album-create-share`;
}

export type AlbumStageSource =
  | { kind: "demo" }
  | {
      kind: "owned";
      albumId: string;
      placed: number;
      ready: number;
      pending: number;
      unavailable: number;
    };

function layoutHref(source: AlbumStageSource, themeId: string, layout: AlbumLayoutMode): string {
  if (source.kind === "owned") {
    return `/albums/${encodeURIComponent(source.albumId)}/preview?layout=${layout}`;
  }
  return `/preview/${themeId}?layout=${layout}`;
}

export function AlbumStage({
  theme,
  album,
  decorations,
  initialLayout,
  source,
  onPhotoError,
  focusTitleOnMount = false,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
  initialLayout: AlbumLayoutMode;
  source: AlbumStageSource;
  onPhotoError?: (src: string) => void;
  focusTitleOnMount?: boolean;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [layout, setLayout] = useState<AlbumLayoutMode>(initialLayout);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    setLayout(initialLayout);
  }, [initialLayout, theme.skin.id]);

  useEffect(() => {
    if (!focusTitleOnMount) return;
    titleRef.current?.focus({ preventScroll: true });
  }, [focusTitleOnMount, album.title]);

  useEffect(() => {
    if (!theme.respectReducedMotion) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPrefersReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme.respectReducedMotion]);

  function selectLayout(next: AlbumLayoutMode) {
    const resolved = resolveAlbumLayout(theme, next);
    setLayout(resolved);
    router.replace(layoutHref(source, theme.skin.id, resolved), { scroll: false });
  }

  const faces = albumFontFaces(theme);
  const style = {
    ...shareThemeStyle(theme.skin),
    "--share-ink": buttonInk(theme.skin.colors.brand, theme.skin.colors.text, theme.skin.colors.background),
    "--album-radius-sm": `${theme.radiusSm}px`,
    "--album-noise": String(theme.noise),
    "--album-title-face": faces.title,
    "--album-body-face": faces.body,
    "--album-hand-face": faces.hand,
    "--album-hover-lift": `${theme.hoverLift}px`,
  } as CSSProperties;

  return (
    <main
      className="album-shell"
      data-theme={theme.skin.id}
      data-motion={theme.motionEnter}
      data-respect-motion={theme.respectReducedMotion ? "true" : "false"}
      data-layout={layout}
      data-album-source={source.kind}
      style={style}
    >
      <div className="album-backdrop" aria-hidden="true">
        {theme.skin.id === "cotton-candy" ? (
          <>
            <SvgMark markup={decorations["soft-blob"]} className="blob blob-a" />
            <SvgMark markup={decorations["soft-blob"]} className="blob blob-b" />
          </>
        ) : null}
        {theme.skin.id === "kyoto-lantern" ? (
          <SvgMark markup={decorations["lantern-glow"]} className="lantern-float" />
        ) : null}
      </div>

      <div className="album-toolbar">
        <div className="toolbar-row toolbar-row-head">
          <p className="toolbar-brand">
            <Link href="/">念册</Link>
            <span aria-hidden="true"> / </span>
            {source.kind === "owned" ? (
              <>
                <Link href="/albums">相册</Link>
                <span aria-hidden="true"> / </span>
                <Link href={`/albums/${encodeURIComponent(source.albumId)}`}>返回这本</Link>
              </>
            ) : (
              <Link href="/preview">样张</Link>
            )}
          </p>
          {source.kind === "owned" ? (
            <Link className="owned-share-cta" href={albumShareHref(source.albumId)}>
              生成分享链接
            </Link>
          ) : null}
        </div>
        {source.kind === "demo" ? (
          <nav className="theme-switch" aria-label="模板">
            {THEME_IDS.map((id) => {
              const other = albumTheme(id);
              if (!other) return null;
              const mode = resolveAlbumLayout(other, layout);
              return (
                <Link
                  key={id}
                  href={`/preview/${id}?layout=${mode}`}
                  aria-current={id === theme.skin.id ? "page" : undefined}
                >
                  {other.skin.name}
                </Link>
              );
            })}
          </nav>
        ) : (
          <p className="layout-note owned-sample-link">
            <Link href={`/preview/${theme.skin.id}`}>同主题样张</Link>
          </p>
        )}
        {theme.layouts.length > 1 ? (
          <div className="layout-switch toolbar-row-layout" role="group" aria-label="版式">
            <button type="button" aria-pressed={layout === "story"} onClick={() => selectLayout("story")}>
              故事
            </button>
            <button type="button" aria-pressed={layout === "flip"} onClick={() => selectLayout("flip")}>
              翻页
            </button>
          </div>
        ) : (
          <p className="layout-note">这套模板只排故事滚动</p>
        )}
      </div>

      <header className="album-intro">
        <p className="kicker">{theme.englishName}</p>
        <h1 tabIndex={-1} ref={titleRef}>{album.title}</h1>
        <p className="lede">{album.subtitle}</p>
        {source.kind === "demo" ? (
          <p className="sample-note">样张预览，使用示例图片，不读取上传的照片。</p>
        ) : (
          <p className="sample-note">{ownedNote(source)}</p>
        )}
        {layout === "story" ? (
          <nav className="slot-nav" aria-label="册页">
            {album.slots.map((slot) => (
              <a key={slot.id} href={`#slot-${slot.id}`}>
                {slot.kicker}
              </a>
            ))}
          </nav>
        ) : null}
      </header>

      {layout === "flip" ? (
        <FlipStage
          theme={theme}
          album={album}
          decorations={decorations}
          reduced={prefersReduced && theme.respectReducedMotion}
          onPhotoError={onPhotoError}
        />
      ) : (
        <div className="album-story">
          {album.slots.map((slot, index) => (
            <section
              key={slot.id}
              id={`slot-${slot.id}`}
              className="album-sheet"
              data-slot={slot.type}
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            >
              <SlotSheet
                theme={theme}
                slot={slot}
                decorations={decorations}
                mode="story"
                pageNumber={index + 1}
                pageCount={album.slots.length}
                onPhotoError={onPhotoError}
              />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function ownedNote(source: Extract<AlbumStageSource, { kind: "owned" }>): string {
  const parts = ["放进版面的是这本相册的预览图，不是原图。页上的句子来自模板。"];
  parts.push(source.placed > 0 ? `已排入 ${source.placed} 张。` : "还没有可排进册子的预览图。");
  if (source.pending > 0) parts.push(`${source.pending} 张正在生成预览，好了会补进空位。`);
  if (source.unavailable > 0) parts.push(`${source.unavailable} 张没有可用预览。`);
  if (source.ready > source.placed) {
    parts.push(`另有 ${source.ready - source.placed} 张预览图超出槽位，仍留在相册里。`);
  }
  return parts.join("");
}

function FlipStage({
  theme,
  album,
  decorations,
  reduced,
  onPhotoError,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
  reduced: boolean;
  onPhotoError?: (src: string) => void;
}) {
  if (reduced) {
    return <InstantBook theme={theme} album={album} decorations={decorations} onPhotoError={onPhotoError} />;
  }
  return <AnimatedBook theme={theme} album={album} decorations={decorations} onPhotoError={onPhotoError} />;
}

function AnimatedBook({
  theme,
  album,
  decorations,
  onPhotoError,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
  onPhotoError?: (src: string) => void;
}) {
  const apiRef = useRef<FlipApi | null>(null);
  const [cursor, setCursor] = useState({ page: 0, total: album.slots.length, orientation: "portrait" });
  const onFlip = useCallback((page: number, total: number, orientation: string) => {
    setCursor({ page, total, orientation });
  }, []);
  const stableAlbum = useMemo(() => album, [album]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        apiRef.current?.flipNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        apiRef.current?.flipPrev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const atStart = cursor.page <= 0;
  const paired = cursor.orientation === "landscape" && cursor.page > 0 && cursor.page + 1 < cursor.total;
  const atEnd = paired ? cursor.page + 1 >= cursor.total - 1 : cursor.page >= cursor.total - 1;
  const pageLabel = paired
    ? `第 ${cursor.page + 1}–${Math.min(cursor.total, cursor.page + 2)} / ${cursor.total} 页`
    : `第 ${cursor.page + 1} / ${cursor.total} 页`;

  return (
    <div className="album-flip-stage">
      <FlipBook
        theme={theme}
        album={stableAlbum}
        decorations={decorations}
        apiRef={apiRef}
        onFlip={onFlip}
        onPhotoError={onPhotoError}
      />
      <nav className="flip-controls" aria-label="翻页控制">
        <button type="button" aria-label="上一页" onClick={() => apiRef.current?.flipPrev()} disabled={atStart}>
          上一页
        </button>
        <p aria-live="polite" aria-atomic="true">{pageLabel}</p>
        <button type="button" aria-label="下一页" onClick={() => apiRef.current?.flipNext()} disabled={atEnd}>
          下一页
        </button>
      </nav>
      <p className="flip-hint">点书页边缘、左右滑动或按方向键翻页。封面在翻开前单独占一页。</p>
    </div>
  );
}

function InstantBook({
  theme,
  album,
  decorations,
  onPhotoError,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
  onPhotoError?: (src: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const slot = album.slots[index];
  if (!slot) return null;
  return (
    <div className="album-flip-stage">
      <div className="instant-book">
        <article className="album-sheet instant-sheet">
          <SlotSheet
            theme={theme}
            slot={slot}
            decorations={decorations}
            mode="flip"
            pageNumber={index + 1}
            pageCount={album.slots.length}
            onPhotoError={onPhotoError}
          />
        </article>
      </div>
      <nav className="flip-controls" aria-label="翻页控制">
        <button
          type="button"
          aria-label="上一页"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0}
        >
          上一页
        </button>
        <p aria-live="polite" aria-atomic="true">
          第 {index + 1} / {album.slots.length} 页
        </p>
        <button
          type="button"
          aria-label="下一页"
          onClick={() => setIndex((value) => Math.min(album.slots.length - 1, value + 1))}
          disabled={index >= album.slots.length - 1}
        >
          下一页
        </button>
      </nav>
      <p className="flip-hint">系统开启了减少动态效果，这一册改成逐页切换，不再播放翻页动画。</p>
    </div>
  );
}
