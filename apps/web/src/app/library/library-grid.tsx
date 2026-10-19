"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { assetStatusLabel, previewUrl } from "../../lib/album-assets";
import {
  gridNeighbor,
  groupPhotosByTime,
  justifyPhotoRows,
  libraryLayoutMetrics,
  photoAspect,
  photoCalendar,
  type LibraryPhoto,
} from "../../lib/library";

/**
 * 时间墙。每一天单独成行，不把两天的照片挤进同一条。
 * 鼠标点击切换选择；触摸在进入选择前忽略轻点，长按才选中。
 * 方向键在已测量的行之间移动焦点。
 */

type Gesture = "toggle" | "add";

export function LibraryGrid({
  photos,
  timeZone,
  selected,
  selecting,
  focusId,
  locked,
  onFocus,
  onToggle,
  onClear,
  onPreviewError,
}: {
  photos: readonly LibraryPhoto[];
  timeZone: string;
  selected: readonly string[];
  selecting: boolean;
  focusId: string | null;
  locked: boolean;
  onFocus: (id: string) => void;
  onToggle: (id: string, shift: boolean, gesture: Gesture) => void;
  onClear: () => void;
  onPreviewError: (src: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const groups = useMemo(() => groupPhotosByTime(photos, timeZone), [photos, timeZone]);
  const byId = useMemo(() => new Map(photos.map((photo) => [photo.assetId, photo])), [photos]);
  const metrics = libraryLayoutMetrics(width);
  const measured = width >= 64;

  const sections = useMemo(() => {
    const blocks: {
      key: string;
      year?: string;
      month?: string;
      heading: string;
      meta: string;
      rows: { id: string; width: number; height: number }[][];
    }[] = [];
    const pushDay = (
      key: string,
      heading: string,
      meta: string,
      dayPhotos: readonly LibraryPhoto[],
      labels: { year?: string; month?: string },
    ) => {
      const rows = measured
        ? justifyPhotoRows(
            dayPhotos.map((photo) => ({ id: photo.assetId, aspect: photoAspect(photo) })),
            width,
            metrics,
          )
        : dayPhotos.map((photo) => [{ id: photo.assetId, width: 0, height: 0 }]);
      blocks.push({ key, heading, meta, rows, ...labels });
    };
    for (const year of groups.years) {
      let yearShown = false;
      for (const month of year.months) {
        let monthShown = false;
        for (const day of month.days) {
          pushDay(
            day.key,
            day.label,
            `${day.weekday} · ${day.photos.length} 张${day.uploadFallback ? " · 按上传日期" : ""}`,
            day.photos,
            {
              year: yearShown ? undefined : year.label,
              month: monthShown ? undefined : month.label,
            },
          );
          yearShown = true;
          monthShown = true;
        }
      }
    }
    if (groups.undated.length > 0) {
      pushDay("undated", "日期未知", `${groups.undated.length} 张`, groups.undated, {});
    }
    return blocks;
  }, [groups, measured, metrics, width]);

  const allRows = sections.flatMap((section) => section.rows);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      onClear();
      return;
    }
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const next = gridNeighbor(allRows, focusId, event.key);
    if (!next) return;
    onFocus(next);
    if (event.shiftKey && !locked) onToggle(next, true, "toggle");
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(next) : next;
    frameRef.current?.querySelector<HTMLButtonElement>(`[data-asset-id="${escaped}"]`)?.focus();
  }

  const firstId = allRows[0]?.[0]?.id ?? null;

  return (
    <div
      ref={frameRef}
      className={selecting ? "lib-frame lib-selecting" : "lib-frame"}
      onKeyDown={onKeyDown}
    >
      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`day-${section.key}`}>
          {section.year ? <h2 className="lib-year">{section.year}</h2> : null}
          {section.month ? <p className="lib-month">{section.month}</p> : null}
          <div className="lib-day">
            <h3 id={`day-${section.key}`}>{section.heading}</h3>
            <p>{section.meta}</p>
          </div>
          <div className={measured ? "lib-rows" : "lib-fallback-row"} style={measured ? { gap: metrics.gap } : undefined}>
            {(measured ? section.rows : [section.rows.flat()]).map((row, rowIndex) => (
              <div
                key={`${section.key}-${rowIndex}`}
                className={measured ? "lib-row" : undefined}
                style={measured ? { gap: metrics.gap } : undefined}
              >
                {row.map((tile) => {
                  const item = byId.get(tile.id);
                  if (!item) return null;
                  return (
                    <LibraryTile
                      key={tile.id}
                      photo={item}
                      timeZone={timeZone}
                      selected={selected.includes(tile.id)}
                      selecting={selecting}
                      tabIndex={focusId ? (focusId === tile.id ? 0 : -1) : tile.id === firstId ? 0 : -1}
                      width={measured ? tile.width : undefined}
                      height={measured ? tile.height : undefined}
                      locked={locked}
                      onFocus={onFocus}
                      onToggle={onToggle}
                      onPreviewError={onPreviewError}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LibraryTile({
  photo,
  timeZone,
  selected,
  selecting,
  tabIndex,
  width,
  height,
  locked,
  onFocus,
  onToggle,
  onPreviewError,
}: {
  photo: LibraryPhoto;
  timeZone: string;
  selected: boolean;
  selecting: boolean;
  tabIndex: number;
  width?: number;
  height?: number;
  locked: boolean;
  onFocus: (id: string) => void;
  onToggle: (id: string, shift: boolean, gesture: Gesture) => void;
  onPreviewError: (src: string) => void;
}) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const pointerKind = useRef("mouse");
  const src = previewUrl(photo.previews);
  const calendar = photoCalendar(photo, timeZone);
  const when = calendar
    ? `${calendar.year}年${calendar.month}月${calendar.day}日，${calendar.source === "capture" ? "拍摄日期" : "上传日期"}`
    : "日期未知";
  const status = photo.status === "ready" ? "" : `，${assetStatusLabel(photo.status)}`;
  const label = `${photo.filename || "照片"}，${when}，${selected ? "已选" : "未选"}${status}`;

  function clearTimer() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  return (
    <button
      type="button"
      className="lib-tile"
      data-asset-id={photo.assetId}
      aria-pressed={selected}
      aria-label={label}
      tabIndex={tabIndex}
      disabled={locked}
      style={width && height ? { width, height, flex: "0 0 auto" } : undefined}
      onFocus={() => onFocus(photo.assetId)}
      onPointerDown={(event) => {
        if (event.button !== 0 || locked) return;
        pointerKind.current = event.pointerType;
        fired.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
        clearTimer();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          onToggle(photo.assetId, false, "add");
        }, 520);
      }}
      onPointerMove={(event) => {
        if (!origin.current) return;
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        if (dx * dx + dy * dy > 144) clearTimer();
      }}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onContextMenu={(event) => {
        if (pointerKind.current === "touch") event.preventDefault();
      }}
      onClick={(event) => {
        if (fired.current) {
          fired.current = false;
          event.preventDefault();
          return;
        }
        if (pointerKind.current === "touch" && !selecting) return;
        onToggle(photo.assetId, event.shiftKey, "toggle");
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => onPreviewError(src)}
        />
      ) : (
        <span className="lib-placeholder">
          {photo.status === "failed"
            ? photo.error || "处理失败"
            : photo.status === "ready"
              ? "暂无预览"
              : assetStatusLabel(photo.status)}
        </span>
      )}
      <span className="lib-check" aria-hidden="true">
        <svg viewBox="0 0 16 16">
          <path
            d="M3.5 8.2 6.4 11 12.5 4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
