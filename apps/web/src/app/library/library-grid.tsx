"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewUrl } from "../../lib/album-assets";
import {
  flattenGroupIds,
  groupPhotosByTime,
  libraryPhotoSelectable,
  type LibraryPhoto,
} from "../../lib/library";

const LONG_PRESS_MS = 450;

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
    if (!focusId) return;
    const escaped = CSS.escape(focusId);
    frameRef.current?.querySelector<HTMLButtonElement>(`[data-asset-id="${escaped}"]`)?.focus();
  }, [focusId]);

  return (
    <div
      ref={frameRef}
      className={selecting ? "lib-frame lib-selecting" : "lib-frame"}
      role="grid"
      aria-multiselectable={selecting}
      onKeyDown={onKeyDown}
    >
      {groups.years.map((year) =>
        year.months.map((month) =>
          month.days.map((day) => {
            const dayIds = day.photos.map((p) => p.assetId);
            const selectableIds = day.photos.filter(libraryPhotoSelectable).map((p) => p.assetId);
            const selectedInDay = selectableIds.filter((id) => selected.includes(id)).length;
            const dayChecked =
              selectableIds.length > 0 && selectedInDay === selectableIds.length
                ? true
                : selectedInDay > 0
                  ? "mixed"
                  : false;
            return (
              <section key={day.key} className="lib-day-block" aria-labelledby={`day-${day.key}`}>
                <div className="lib-sticky-stack">
                  <div className="lib-sticky-year" aria-hidden="true">
                    <span className="lib-sticky-year-num">{year.year}</span>
                    <span className="lib-sticky-month-inline">{month.month} 月</span>
                  </div>
                  <p className="lib-sticky-month" aria-hidden="true">{month.month} 月</p>
                  <div className="lib-sticky-day">
                    <h3 id={`day-${day.key}`}>
                      {month.month} 月 {day.day} 日 · {day.weekday} · {day.photos.length} 张
                      {day.uploadFallback ? " · 按上传日期" : ""}
                    </h3>
                    <label className="lib-day-select">
                      <input
                        type="checkbox"
                        checked={dayChecked === true}
                        aria-checked={dayChecked === "mixed" ? "mixed" : dayChecked}
                        disabled={locked || selectableIds.length === 0}
                        onChange={() => {
                          onSelectDay(selectableIds, dayChecked !== true);
                        }}
                      />
                      选这天
                    </label>
                  </div>
                </div>
                <div className="lib-grid" role="rowgroup">
                  {day.photos.map((photo, index) => (
                    <LibraryTile
                      key={photo.assetId}
                      photo={photo}
                      indexInDay={index + 1}
                      totalInDay={day.photos.length}
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
          }),
        ),
      )}
      {groups.undated.length > 0 ? (
        <section className="lib-day-block">
          <div className="lib-sticky-stack">
            <div className="lib-sticky-day">
              <h3>日期待定</h3>
            </div>
          </div>
          <div className="lib-grid" role="rowgroup">
            {groups.undated.map((photo, index) => (
              <LibraryTile
                key={photo.assetId}
                photo={photo}
                indexInDay={index + 1}
                totalInDay={groups.undated.length}
                timeZone={timeZone}
                selected={selected.includes(photo.assetId)}
                selectable={libraryPhotoSelectable(photo)}
                selecting={selecting}
                tabIndex={-1}
                locked={locked}
                pressTimer={pressTimer}
                onFocus={() => onFocus(photo.assetId)}
                onToggle={(shift, gesture) => onToggle(photo.assetId, shift, gesture)}
                onPreviewError={onPreviewError}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
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
