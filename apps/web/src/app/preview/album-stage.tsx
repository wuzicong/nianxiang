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

export function AlbumStage({
  theme,
  album,
  decorations,
  initialLayout,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
  initialLayout: AlbumLayoutMode;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState<AlbumLayoutMode>(initialLayout);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    setLayout(initialLayout);
  }, [initialLayout, theme.skin.id]);

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
    router.replace(`/preview/${theme.skin.id}?layout=${resolved}`, { scroll: false });
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
        <p className="toolbar-brand">
          <Link href="/">念册</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/preview">样张</Link>
        </p>
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
        {theme.layouts.length > 1 ? (
          <div className="layout-switch" role="group" aria-label="版式">
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
        <h1>{album.title}</h1>
        <p className="lede">{album.subtitle}</p>
        <p className="sample-note">样张预览，使用示例图片，不读取上传的照片。</p>
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
              />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function FlipStage({
  theme,
  album,
  decorations,
  reduced,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
  reduced: boolean;
}) {
  if (reduced) {
    return <InstantBook theme={theme} album={album} decorations={decorations} />;
  }
  return <AnimatedBook theme={theme} album={album} decorations={decorations} />;
}

function AnimatedBook({
  theme,
  album,
  decorations,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
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
      <FlipBook theme={theme} album={stableAlbum} decorations={decorations} apiRef={apiRef} onFlip={onFlip} />
      <div className="flip-controls">
        <button type="button" onClick={() => apiRef.current?.flipPrev()} disabled={atStart}>
          上一页
        </button>
        <p>{pageLabel}</p>
        <button type="button" onClick={() => apiRef.current?.flipNext()} disabled={atEnd}>
          下一页
        </button>
      </div>
      <p className="flip-hint">点书页右侧或按右方向键翻到下一页。封面在翻开前单独占一页。</p>
    </div>
  );
}

function InstantBook({
  theme,
  album,
  decorations,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
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
          />
        </article>
      </div>
      <div className="flip-controls">
        <button type="button" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>
          上一页
        </button>
        <p>
          第 {index + 1} / {album.slots.length} 页
        </p>
        <button
          type="button"
          onClick={() => setIndex((value) => Math.min(album.slots.length - 1, value + 1))}
          disabled={index >= album.slots.length - 1}
        >
          下一页
        </button>
      </div>
      <p className="flip-hint">系统开启了减少动态效果，这一册改成逐页切换，不再播放翻页动画。</p>
    </div>
  );
}
