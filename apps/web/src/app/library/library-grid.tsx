"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewUrl } from "../../lib/album-assets";
import {
  flattenGroupIds,
  groupPhotosByTime,
  libraryPhotoSelectable,
  type LibraryPhoto,
} from "../../lib/library";
import {
  buildDaySegments,
  buildMonthAnchors,
  libraryGridLayout,
  stickyContextAtScroll,
  virtualWindowForScroll,
  type DaySegment,
} from "../../lib/library-virtual";
import { LibraryTimeline } from "./library-timeline";

const LONG_PRESS_MS = 450;
const MOBILE_MAX = 767;

export function LibraryGrid({
  photos,
  timeZone,
  selected,
  selecting,
  focusId,
  locked,
  onFocus,
  onToggle,
  onSelectDay,
  onClear,
  onPreviewError,
}: {
  photos: LibraryPhoto[];
  timeZone: string;
  selected: string[];
  selecting: boolean;
  focusId: string | null;
  locked: boolean;
  onFocus: (id: string) => void;
  onToggle: (id: string, shift: boolean, gesture: "toggle" | "add") => void;
  onSelectDay: (ids: string[], select: boolean) => void;
  onClear: () => void;
  onPreviewError: (src: string) => void;
}) {
  const groups = useMemo(() => groupPhotosByTime(photos, timeZone), [photos, timeZone]);
  const orderedIds = useMemo(() => flattenGroupIds(groups), [groups]);
  const firstId = orderedIds[0] ?? null;
  const frameRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [width, setWidth] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);

  const layout = useMemo(
    () => libraryGridLayout(width > 0 ? width : 1280, mobile),
    [width, mobile],
  );
  const segments = useMemo(() => buildDaySegments(groups, layout), [groups, layout]);
  const monthAnchors = useMemo(() => buildMonthAnchors(segments), [segments]);
  const virtual = useMemo(
    () => virtualWindowForScroll(segments, scrollTop, viewportHeight, layout),
    [segments, scrollTop, viewportHeight, layout],
  );
  const stickyCtx = useMemo(() => stickyContextAtScroll(segments, scrollTop), [segments, scrollTop]);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    setWidth(frame.clientWidth);
    setMobile(window.innerWidth <= MOBILE_MAX);
    setViewportHeight(window.innerHeight);
    const top = frame.getBoundingClientRect().top + window.scrollY;
    setScrollTop(Math.max(0, window.scrollY - top));
  }, []);

  useEffect(() => {
    measure();
    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(() => measure());
    if (frameRef.current) observer.observe(frameRef.current);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    measure();
  }, [photos.length, measure]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (locked) return;
      const current = focusId ?? firstId;
      if (!current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClear();
        return;
      }
      if (event.key === " " && current) {
        event.preventDefault();
        onToggle(current, false, selecting ? "toggle" : "toggle");
        return;
      }
      const neighbor = neighborId(orderedIds, current, event.key);
      if (neighbor) {
        event.preventDefault();
        if (event.shiftKey && selecting) {
          onToggle(neighbor, true, "toggle");
        } else {
          onFocus(neighbor);
        }
      }
    },
    [focusId, firstId, locked, onClear, onFocus, onToggle, orderedIds, selecting],
  );

  useEffect(() => {
    if (!focusId || !frameRef.current) return;
    const escaped = CSS.escape(focusId);
    const tile = frameRef.current.querySelector<HTMLButtonElement>(`[data-asset-id="${escaped}"]`);
    if (tile) {
      tile.focus();
      return;
    }
    const index = segments.findIndex((segment) => segment.photos.some((p) => p.assetId === focusId));
    if (index < 0) return;
    const top = frameRef.current.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + segments[index]!.offset - layout.dayHeader, behavior: "smooth" });
  }, [focusId, segments, layout.dayHeader]);

  const jumpToOffset = useCallback(
    (offset: number) => {
      if (!frameRef.current) return;
      const top = frameRef.current.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + offset, behavior: "auto" });
      measure();
    },
    [measure],
  );

  const visibleSegments: { segment: DaySegment; index: number }[] = [];
  if (virtual.end >= virtual.start) {
    for (let index = virtual.start; index <= virtual.end; index += 1) {
      const segment = segments[index];
      if (segment) visibleSegments.push({ segment, index });
    }
  }

  return (
    <div className="lib-virtual-wrap">
      <div
        ref={frameRef}
        className={selecting ? "lib-frame lib-selecting" : "lib-frame"}
        role="grid"
        aria-multiselectable={selecting}
        onKeyDown={onKeyDown}
        style={{ minHeight: virtual.totalHeight > 0 ? virtual.totalHeight : undefined }}
      >
        {stickyCtx && !stickyCtx.undated ? (
          <div className="lib-sticky-pseudo-mount" aria-hidden="true">
            {!layout.mobile ? (
              <div className="lib-sticky-year lib-sticky-pseudo">
                <span className="lib-sticky-year-num">{stickyCtx.year}</span>
              </div>
            ) : null}
            <p className="lib-sticky-month lib-sticky-pseudo">
              <span className="lib-sticky-month-inline">{stickyCtx.year} · </span>
              {stickyCtx.month} 月
            </p>
          </div>
        ) : null}
        {virtual.totalHeight > 0 ? <div className="lib-virtual-spacer" style={{ height: virtual.topSpacer }} aria-hidden="true" /> : null}
        {visibleSegments.map(({ segment }) => (
          <DayBlock
            key={segment.key}
            segment={segment}
            timeZone={timeZone}
            selected={selected}
            selecting={selecting}
            focusId={focusId}
            firstId={firstId}
            locked={locked}
            pressTimer={pressTimer}
            onFocus={onFocus}
            onToggle={onToggle}
            onSelectDay={onSelectDay}
            onPreviewError={onPreviewError}
          />
        ))}
        {virtual.totalHeight > 0 ? (
          <div className="lib-virtual-spacer" style={{ height: virtual.bottomSpacer }} aria-hidden="true" />
        ) : null}
      </div>
      <LibraryTimeline
        anchors={monthAnchors}
        totalHeight={virtual.totalHeight}
        scrollTop={scrollTop}
        mobile={mobile}
        onJump={jumpToOffset}
      />
      <p className="lib-sr" data-virtual-tiles={countTiles(visibleSegments)} data-virtual-total={photos.length} />
    </div>
  );
}

function countTiles(items: { segment: DaySegment }[]): number {
  return items.reduce((sum, item) => sum + item.segment.photos.length, 0);
}

function DayBlock({
  segment,
  timeZone,
  selected,
  selecting,
  focusId,
  firstId,
  locked,
  pressTimer,
  onFocus,
  onToggle,
  onSelectDay,
  onPreviewError,
}: {
  segment: DaySegment;
  timeZone: string;
  selected: string[];
  selecting: boolean;
  focusId: string | null;
  firstId: string | null;
  locked: boolean;
  pressTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onFocus: (id: string) => void;
  onToggle: (id: string, shift: boolean, gesture: "toggle" | "add") => void;
  onSelectDay: (ids: string[], select: boolean) => void;
  onPreviewError: (src: string) => void;
}) {
  const selectableIds = segment.photos.filter(libraryPhotoSelectable).map((p) => p.assetId);
  const selectedInDay = selectableIds.filter((id) => selected.includes(id)).length;
  const dayChecked =
    selectableIds.length > 0 && selectedInDay === selectableIds.length
      ? true
      : selectedInDay > 0
        ? "mixed"
        : false;

  return (
    <section
      className="lib-day-block"
      aria-labelledby={segment.undated ? undefined : `day-${segment.key}`}
      style={{ minHeight: segment.height }}
    >
      <div className="lib-sticky-day">
        <h3 id={segment.undated ? undefined : `day-${segment.key}`}>
          {segment.undated
            ? "日期待定"
            : `${segment.month} 月 ${segment.day} 日 · ${segment.weekday} · ${segment.photos.length} 张${segment.uploadFallback ? " · 按上传日期" : ""}`}
        </h3>
        {!segment.undated ? (
          <label className="lib-day-select">
            <input
              type="checkbox"
              checked={dayChecked === true}
              aria-checked={dayChecked === "mixed" ? "mixed" : dayChecked}
              disabled={locked || selectableIds.length === 0}
              onChange={() => onSelectDay(selectableIds, dayChecked !== true)}
            />
            选这天
          </label>
        ) : null}
      </div>
      <div className="lib-grid" role="rowgroup">
        {segment.photos.map((photo, index) => (
          <LibraryTile
            key={photo.assetId}
            photo={photo}
            indexInDay={index + 1}
            totalInDay={segment.photos.length}
            timeZone={timeZone}
            selected={selected.includes(photo.assetId)}
            selectable={libraryPhotoSelectable(photo)}
            selecting={selecting}
            tabIndex={focusId ? (focusId === photo.assetId ? 0 : -1) : photo.assetId === firstId ? 0 : -1}
            locked={locked}
            pressTimer={pressTimer}
            onFocus={() => onFocus(photo.assetId)}
            onToggle={(shift, gesture) => onToggle(photo.assetId, shift, gesture)}
            onPreviewError={onPreviewError}
          />
        ))}
      </div>
    </section>
  );
}

function LibraryTile({
  photo,
  indexInDay,
  totalInDay,
  timeZone,
  selected,
  selectable,
  selecting,
  tabIndex,
  locked,
  pressTimer,
  onFocus,
  onToggle,
  onPreviewError,
}: {
  photo: LibraryPhoto;
  indexInDay: number;
  totalInDay: number;
  timeZone: string;
  selected: boolean;
  selectable: boolean;
  selecting: boolean;
  tabIndex: number;
  locked: boolean;
  pressTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onFocus: () => void;
  onToggle: (shift: boolean, gesture: "toggle" | "add") => void;
  onPreviewError: (src: string) => void;
}) {
  const src = previewUrl(photo.previews);
  const processing = photo.status !== "ready" && photo.status !== "failed";
  const failed = photo.status === "failed";
  const label = tileAriaLabel(photo, indexInDay, totalInDay, timeZone, selected);

  function clearPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  return (
    <button
      type="button"
      role="gridcell"
      className="lib-tile"
      data-asset-id={photo.assetId}
      data-failed={failed ? "true" : "false"}
      aria-selected={selecting ? selected : undefined}
      aria-pressed={selecting ? selected : undefined}
      aria-disabled={!selectable || locked}
      aria-label={label}
      tabIndex={tabIndex}
      disabled={locked}
      onFocus={onFocus}
      onClick={(event) => {
        if (!selectable) return;
        if (selecting) {
          onToggle(event.shiftKey, "toggle");
          return;
        }
        if (event.metaKey || event.ctrlKey) {
          onToggle(false, "toggle");
          return;
        }
      }}
      onPointerDown={(event) => {
        if (!selectable || locked || event.pointerType === "mouse") return;
        clearPress();
        pressTimer.current = setTimeout(() => {
          pressTimer.current = null;
          try {
            navigator.vibrate?.(10);
          } catch {
            /* ignore */
          }
          onToggle(false, "add");
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => onPreviewError(src)}
        />
      ) : (
        <span className="lib-placeholder">
          {failed ? "预览没生成" : processing ? "正在生成预览" : "…"}
        </span>
      )}
      <span className="lib-check" aria-hidden="true">
        <svg viewBox="0 0 12 12" fill="none">
          <path d="M2 6.2 4.8 9 10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      {!photo.takenAt ? <span className="lib-no-taken" title="无拍摄时间">·</span> : null}
    </button>
  );
}

function neighborId(
  orderedIds: readonly string[],
  focusId: string,
  key: string,
): string | null {
  const index = orderedIds.indexOf(focusId);
  if (index < 0) return null;
  if (key === "Home") return orderedIds[0] ?? null;
  if (key === "End") return orderedIds[orderedIds.length - 1] ?? null;
  if (key === "ArrowLeft" || key === "ArrowUp") return orderedIds[index - 1] ?? focusId;
  if (key === "ArrowRight" || key === "ArrowDown") return orderedIds[index + 1] ?? focusId;
  return null;
}

function tileAriaLabel(
  photo: LibraryPhoto,
  indexInDay: number,
  totalInDay: number,
  timeZone: string,
  selected: boolean,
): string {
  const stamp = photo.takenAt ?? photo.uploadedAt;
  let when = "日期未知";
  if (stamp) {
    try {
      const d = photo.takenAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(photo.takenAt)
        ? new Date(
            Number(photo.takenAt.slice(0, 4)),
            Number(photo.takenAt.slice(5, 7)) - 1,
            Number(photo.takenAt.slice(8, 10)),
            Number(photo.takenAt.slice(11, 13)),
            Number(photo.takenAt.slice(14, 16)),
          )
        : new Date(stamp);
      when = new Intl.DateTimeFormat("zh-CN", {
        timeZone,
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      when = "日期未知";
    }
  }
  const base = `${when} 拍摄的照片，第 ${indexInDay} 张，共 ${totalInDay} 张`;
  if (photo.status === "failed") return `${base}，预览未生成，不可选入相册`;
  return selected ? `${base}，已选` : base;
}
