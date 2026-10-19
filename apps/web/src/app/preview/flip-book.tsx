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
export const FlipBook = memo(function FlipBook({
  theme,
  album,
  decorations,
  apiRef,
  onFlip,
}: {
  theme: AlbumTheme;
  album: DemoAlbum;
  decorations: Record<string, string>;
  apiRef: { current: FlipApi | null };
  onFlip: (page: number, total: number, orientation: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let flip: PageFlip | null = null;
    let block: HTMLDivElement | null = null;
    const roots: Root[] = [];

    void import("page-flip").then(({ PageFlip }) => {
      if (cancelled || !mountRef.current) return;
      block = document.createElement("div");
      block.className = "album-flip-block";
      mountRef.current.appendChild(block);

      const pages = album.slots.map((slot, index) => {
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
              pageCount={album.slots.length}
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

      const flippingTime = theme.motionEnter === "spring" ? 900 : theme.motionEnter === "editorial-fade" ? 640 : 800;
      flip = new PageFlip(block, {
        width: 420,
        height: 620,
        size: "stretch",
        minWidth: 280,
        maxWidth: 520,
        minHeight: 430,
        maxHeight: 760,
        drawShadow: true,
        flippingTime,
        usePortrait: true,
        startZIndex: 2,
        autoSize: true,
        maxShadowOpacity: theme.skin.id === "kyoto-lantern" ? 0.55 : 0.35,
        showCover: true,
        mobileScrollSupport: false,
        swipeDistance: 24,
        clickEventForward: true,
        useMouseEvents: true,
        showPageCorners: true,
        disableFlipByClick: false,
        startPage: 0,
      });
      flip.loadFromHTML(pages);
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
      roots.forEach((root) => root.unmount());
      if (flip) flip.destroy();
      else block?.remove();
    };
  }, [album, apiRef, decorations, onFlip, theme]);

  return <div ref={mountRef} className="album-flip-mount" aria-label="翻页相册" />;
});
