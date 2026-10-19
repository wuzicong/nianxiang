"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { DemoAlbum, DemoPhoto } from "../../lib/album-demo";
import { orderedAlbumPhotos } from "../../lib/album-preview-photos";

type ZoomPhase = "closed" | "entering" | "open" | "leaving";

interface ZoomTarget {
  photo: DemoPhoto;
  rect: DOMRectReadOnly;
}

interface AlbumPhotoZoomApi {
  enabled: boolean;
  openFromElement: (photo: DemoPhoto, element: HTMLElement) => void;
}

const AlbumPhotoZoomContext = createContext<AlbumPhotoZoomApi | null>(null);

export function useAlbumPhotoZoom(): AlbumPhotoZoomApi | null {
  return useContext(AlbumPhotoZoomContext);
}

function zoomTransformFromRect(rect: DOMRectReadOnly, reduced: boolean): CSSProperties {
  if (reduced) {
    return { transform: "translate(-50%, -50%) scale(1)", opacity: 0 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = cx - vw / 2;
  const dy = cy - vh / 2;
  const scale = Math.max(rect.width / vw, rect.height / vh, 0.02);
  return {
    transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`,
    opacity: 0.55,
  };
}

function zoomTransformOpen(reduced: boolean): CSSProperties {
  if (reduced) {
    return { transform: "translate(-50%, -50%) scale(1)", opacity: 1 };
  }
  return { transform: "translate(-50%, -50%) scale(1)", opacity: 1 };
}

export function AlbumPhotoZoomProvider({
  album,
  enabled,
  children,
  onPhotoError,
}: {
  album: DemoAlbum;
  enabled: boolean;
  children: ReactNode;
  onPhotoError?: (src: string) => void;
}) {
  const ordered = useMemo(() => orderedAlbumPhotos(album), [album]);
  const photosById = useMemo(() => new Map(ordered.map((photo) => [photo.id, photo])), [ordered]);
  const [target, setTarget] = useState<ZoomTarget | null>(null);
  const [phase, setPhase] = useState<ZoomPhase>("closed");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [imgStyle, setImgStyle] = useState<CSSProperties>({});
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const leaveRectRef = useRef<DOMRectReadOnly | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const openFromElement = useCallback(
    (photo: DemoPhoto, element: HTMLElement) => {
      if (!enabled) return;
      const img = element instanceof HTMLImageElement ? element : element.querySelector("img");
      const node = img instanceof HTMLImageElement ? img : element;
      const rect = node.getBoundingClientRect();
      leaveRectRef.current = rect;
      setTarget({ photo, rect });
      setPhase("entering");
      setImgStyle(zoomTransformFromRect(rect, reducedMotion));
    },
    [enabled, reducedMotion],
  );

  const api = useMemo(
    () => ({
      enabled,
      openFromElement,
    }),
    [enabled, openFromElement],
  );

  useEffect(() => {
    if (phase !== "entering" || !target) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    closeRef.current?.focus();
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setImgStyle(zoomTransformOpen(reducedMotion));
        setPhase("open");
      });
    });
    return () => cancelAnimationFrame(id);
  }, [phase, target, reducedMotion]);

  const finishClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    setTarget(null);
    setPhase("closed");
    leaveRectRef.current = null;
  }, []);

  const requestClose = useCallback(() => {
    if (!target || phase === "leaving" || phase === "closed") {
      finishClose();
      return;
    }
    const rect = leaveRectRef.current ?? target.rect;
    setPhase("leaving");
    setImgStyle(zoomTransformFromRect(rect, reducedMotion));
    window.setTimeout(finishClose, reducedMotion ? 120 : 280);
  }, [finishClose, phase, reducedMotion, target]);

  const index = target ? ordered.findIndex((p) => p.id === target.photo.id) : -1;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < ordered.length - 1;

  const goTo = useCallback(
    (photoId: string) => {
      const photo = photosById.get(photoId);
      if (!photo) return;
      const thumb = document.querySelector<HTMLElement>(`[data-album-zoom-id="${photoId}"]`);
      const rect = thumb?.getBoundingClientRect() ?? target?.rect;
      if (rect) leaveRectRef.current = rect;
      setTarget({ photo, rect: rect ?? new DOMRect(0, 0, 0, 0) });
      setPhase("open");
      setImgStyle(zoomTransformOpen(reducedMotion));
    },
    [photosById, reducedMotion, target?.rect],
  );

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    const id = ordered[index - 1]?.id;
    if (id) goTo(id);
  }, [goTo, hasPrev, index, ordered]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    const id = ordered[index + 1]?.id;
    if (id) goTo(id);
  }, [goTo, hasNext, index, ordered]);

  useEffect(() => {
    if (phase === "closed" || phase === "entering") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, phase, requestClose]);

  const counter =
    index >= 0 && ordered.length > 0 ? `${index + 1} / ${ordered.length}` : "";
  const caption = target?.photo.caption ?? "";

  return (
    <AlbumPhotoZoomContext.Provider value={api}>
      {children}
      <dialog
        ref={dialogRef}
        className="album-zoom"
        aria-labelledby={labelId}
        aria-modal="true"
        data-phase={phase}
        onCancel={(event) => {
          event.preventDefault();
          requestClose();
        }}
        onClose={finishClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        {target ? (
          <div
            className="album-zoom-inner"
            data-reduced={reducedMotion ? "true" : "false"}
            data-phase={phase}
          >
            <button
              ref={closeRef}
              type="button"
              className="album-zoom-close"
              aria-label="关闭大图"
              onClick={requestClose}
            >
              ✕
            </button>
            <button
              type="button"
              className="album-zoom-nav album-zoom-prev"
              aria-label="上一张"
              disabled={!hasPrev}
              onClick={goPrev}
            >
              ‹
            </button>
            <figure className="album-zoom-stage">
              <img
                key={target.photo.id}
                src={target.photo.src}
                alt={target.photo.alt}
                className="album-zoom-img"
                style={imgStyle}
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => onPhotoError?.(target.photo.src)}
              />
            </figure>
            <button
              type="button"
              className="album-zoom-nav album-zoom-next"
              aria-label="下一张"
              disabled={!hasNext}
              onClick={goNext}
            >
              ›
            </button>
            <footer className="album-zoom-footer">
              <p id={labelId} className="album-zoom-caption">{caption}</p>
              <p className="album-zoom-counter" aria-live="polite">{counter}</p>
            </footer>
          </div>
        ) : null}
      </dialog>
    </AlbumPhotoZoomContext.Provider>
  );
}
