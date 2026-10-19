"use client";

import { memo, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { PageFlip } from "page-flip";
import type { AlbumTheme } from "../../lib/album-theme";
import type { DemoAlbum } from "../../lib/album-demo";
import { SlotSheet } from "./slot-sheet";

export interface FlipApi {
  flipNext: () => void;
  flipPrev: () => void;
}

/**
 * page-flip 会把页节点挪进自己的容器，并把 destroy() 的根节点从文档里摘掉。
 * 所以书挂在 React 不接管子节点的空 div 里，页内容用独立 root 渲染。
 */
function pageStructure(album: DemoAlbum): string {
  return JSON.stringify(
    album.slots.map((slot) => ({
      id: slot.id,
      type: slot.type,
      title: slot.title,
      body: slot.body,
      kicker: slot.kicker,
      beats: slot.beats,
      photos: slot.photos.map((photo) => ({ id: photo.id, alt: photo.alt, caption: photo.caption })),
    })),
  );
}

function photoSelector(id: string): string {
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  return `img[data-photo-id="${escaped}"]`;
}

function flipSettings(theme: AlbumTheme) {
  const viewW = typeof window !== "undefined" ? window.innerWidth : 420;
  const viewH = typeof window !== "undefined" ? window.innerHeight : 800;
  const narrow = viewW < 720;
  const coarse =
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const flippingTime = theme.motionEnter === "spring" ? 900 : theme.motionEnter === "editorial-fade" ? 640 : 800;
  const pageWidth = narrow ? Math.min(360, Math.max(280, viewW - 36)) : 420;
  const pageHeight = narrow ? Math.min(Math.round(viewH * 0.62), 620) : 620;
  return {
    width: pageWidth,
    height: Math.max(430, pageHeight),
    size: "stretch" as const,
    minWidth: narrow ? 260 : 280,
    maxWidth: narrow ? Math.min(viewW - 20, 480) : 520,
    minHeight: narrow ? 380 : 430,
    maxHeight: narrow ? Math.min(Math.round(viewH * 0.78), 720) : 760,
    drawShadow: true,
    flippingTime,
    usePortrait: true,
    startZIndex: 2,
    autoSize: true,
    maxShadowOpacity: theme.skin.id === "kyoto-lantern" ? 0.55 : 0.35,
    showCover: true,
    mobileScrollSupport: coarse,
    swipeDistance: coarse ? 42 : 28,
    clickEventForward: true,
    useMouseEvents: true,
    showPageCorners: true,
    disableFlipByClick: false,
    startPage: 0,
  };
}

export const FlipBook = memo(function FlipBook({
  theme,
  album,
  decorations,
  apiRef,
  onFlip,
  onPhotoError,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
  apiRef: { current: FlipApi | null };
  onFlip: (page: number, total: number, orientation: string) => void;
  onPhotoError?: (src: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const albumRef = useRef(album);
  const onPhotoErrorRef = useRef(onPhotoError);
  albumRef.current = album;
  onPhotoErrorRef.current = onPhotoError;
  const structure = pageStructure(album);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const current = albumRef.current;
    let cancelled = false;
    let flip: PageFlip | null = null;
    let block: HTMLDivElement | null = null;
    let onResize: (() => void) | null = null;
    const roots: Root[] = [];

    void import("page-flip").then(({ PageFlip }) => {
      if (cancelled || !mountRef.current) return;
      block = document.createElement("div");
      block.className = "album-flip-block";
      mountRef.current.appendChild(block);

      const pages = current.slots.map((slot, index) => {
        const page = document.createElement("div");
        page.className = "album-page";
        page.dataset.density = index === 0 || slot.type === "closing" ? "hard" : "soft";
        page.dataset.slot = slot.type;
        const root = createRoot(page);
        flushSync(() => {
          root.render(
            <SlotSheet
              theme={theme}
              slot={slot}
              decorations={decorations}
              mode="flip"
              pageNumber={index + 1}
              pageCount={current.slots.length}
              onPhotoError={(src) => onPhotoErrorRef.current?.(src)}
            />,
          );
        });
        roots.push(root);
        return page;
      });

      if (cancelled) {
        roots.forEach((root) => root.unmount());
        block.remove();
        return;
      }

      flip = new PageFlip(block, flipSettings(theme));
      flip.loadFromHTML(pages);
      onResize = () => {
        flip?.update();
      };
      window.addEventListener("resize", onResize);
      const report = () => {
        onFlip(flip?.getCurrentPageIndex() ?? 0, flip?.getPageCount() ?? pages.length, flip?.getOrientation() ?? "portrait");
      };
      flip.on("flip", report);
      report();
      apiRef.current = {
        flipNext: () => flip?.flipNext("top"),
        flipPrev: () => flip?.flipPrev("top"),
      };
    });

    return () => {
      cancelled = true;
      apiRef.current = null;
      if (onResize) window.removeEventListener("resize", onResize);
      roots.forEach((root) => root.unmount());
      if (flip) flip.destroy();
      else block?.remove();
    };
  }, [apiRef, decorations, onFlip, structure, theme]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    for (const photo of album.slots.flatMap((slot) => slot.photos)) {
      mount.querySelectorAll(photoSelector(photo.id)).forEach((node) => {
        if (node.getAttribute("src") !== photo.src) node.setAttribute("src", photo.src);
      });
    }
  }, [album]);

  return <div ref={mountRef} className="album-flip-mount" aria-label="翻页相册" />;
});
