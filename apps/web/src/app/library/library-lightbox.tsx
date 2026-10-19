"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { lightboxUrl } from "../../lib/album-assets";
import { libraryPhotoCaption, type LibraryPhoto } from "../../lib/library";

const SWIPE_THRESHOLD_PX = 48;

export function LibraryLightbox({
  open,
  assetId,
  orderedIds,
  photosById,
  timeZone,
  onClose,
  onChange,
  onPreviewError,
}: {
  open: boolean;
  assetId: string | null;
  orderedIds: readonly string[];
  photosById: ReadonlyMap<string, LibraryPhoto>;
  timeZone: string;
  onClose: () => void;
  onChange: (id: string) => void;
  onPreviewError: (src: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const swipeRef = useRef<{ pointerId: number; startX: number; dragging: boolean } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const index = assetId ? orderedIds.indexOf(assetId) : -1;
  const photo = assetId ? photosById.get(assetId) : undefined;
  const src = photo ? lightboxUrl(photo.previews) : null;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < orderedIds.length - 1;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && assetId && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, assetId]);

  useEffect(() => {
    if (!open) setSwipeOffset(0);
  }, [open, assetId]);

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    const nextId = orderedIds[index - 1];
    if (nextId) onChange(nextId);
  }, [hasPrev, index, onChange, orderedIds]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    const nextId = orderedIds[index + 1];
    if (nextId) onChange(nextId);
  }, [hasNext, index, onChange, orderedIds]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  useEffect(() => {
    if (!open) return;
    const prevId = hasPrev ? orderedIds[index - 1] : null;
    const nextId = hasNext ? orderedIds[index + 1] : null;
    for (const id of [prevId, nextId]) {
      if (!id) continue;
      const neighbor = photosById.get(id);
      const url = neighbor ? lightboxUrl(neighbor.previews) : null;
      if (url) {
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        img.src = url;
      }
    }
  }, [open, index, hasPrev, hasNext, orderedIds, photosById]);

  useEffect(() => {
    if (!open) return;
    function trapTab(event: KeyboardEvent) {
      const dialogNode = dialogRef.current;
      if (!dialogNode || event.key !== "Tab") return;
      const focusable = dialogNode.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const items = Array.from(focusable).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    const dialogNode = dialogRef.current;
    if (!dialogNode) return;
    dialogNode.addEventListener("keydown", trapTab);
    return () => dialogNode.removeEventListener("keydown", trapTab);
  }, [open]);

  function finishSwipe(deltaX: number) {
    if (deltaX <= -SWIPE_THRESHOLD_PX) goNext();
    else if (deltaX >= SWIPE_THRESHOLD_PX) goPrev();
    setSwipeOffset(0);
    swipeRef.current = null;
  }

  const counter =
    index >= 0 && orderedIds.length > 0 ? `${index + 1} / ${orderedIds.length}` : "";
  const caption = photo ? libraryPhotoCaption(photo, timeZone) : "";

  return (
    <dialog
      ref={dialogRef}
      className="lib-lightbox"
      aria-labelledby={labelId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lib-lightbox-inner" data-reduced={reducedMotion ? "true" : "false"}>
        <button
          ref={closeRef}
          type="button"
          className="lib-lightbox-close"
          aria-label="关闭预览"
          onClick={onClose}
        >
          ✕
        </button>

        <button
          type="button"
          className="lib-lightbox-nav lib-lightbox-prev"
          aria-label="上一张"
          disabled={!hasPrev}
          onClick={goPrev}
        >
          ‹
        </button>

        <figure
          className="lib-lightbox-stage"
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            swipeRef.current = { pointerId: event.pointerId, startX: event.clientX, dragging: true };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const swipe = swipeRef.current;
            if (!swipe || swipe.pointerId !== event.pointerId || !swipe.dragging) return;
            setSwipeOffset(event.clientX - swipe.startX);
          }}
          onPointerUp={(event) => {
            const swipe = swipeRef.current;
            if (!swipe || swipe.pointerId !== event.pointerId) return;
            swipe.dragging = false;
            finishSwipe(event.clientX - swipe.startX);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            const swipe = swipeRef.current;
            if (!swipe || swipe.pointerId !== event.pointerId) return;
            setSwipeOffset(0);
            swipeRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          {src ? (
            <img
              key={assetId}
              src={src}
              alt=""
              className="lib-lightbox-img"
              style={reducedMotion ? undefined : { transform: `translateX(${swipeOffset}px)` }}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => onPreviewError(src)}
            />
          ) : (
            <p className="lib-lightbox-empty">预览暂时不可用</p>
          )}
        </figure>

        <button
          type="button"
          className="lib-lightbox-nav lib-lightbox-next"
          aria-label="下一张"
          disabled={!hasNext}
          onClick={goNext}
        >
          ›
        </button>

        <footer className="lib-lightbox-footer">
          <p id={labelId} className="lib-lightbox-caption">{caption}</p>
          <p className="lib-lightbox-counter" aria-live="polite">{counter}</p>
        </footer>
      </div>
    </dialog>
  );
}
