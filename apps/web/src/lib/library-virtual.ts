import type { LibraryPhoto, TimeGroups } from "./library";

/** 与 library.css 断点一致：方格列数。 */
export function libraryGridColumns(containerWidth: number): number {
  if (containerWidth >= 1600) return 8;
  if (containerWidth >= 1280) return 7;
  if (containerWidth >= 768) return 5;
  return 3;
}

export function libraryGridGap(containerWidth: number): number {
  if (containerWidth >= 1280) return 6;
  if (containerWidth >= 768) return 4;
  return 2;
}

/** 日组块间距（library-grid-gaps.md §3.2）；须与 library.css `.lib-day-block` 一致。 */
export function libraryDayGroupSpacing(containerWidth: number): number {
  if (containerWidth >= 1280) return 24;
  if (containerWidth >= 768) return 20;
  return 16;
}

export interface LibraryGridLayout {
  containerWidth: number;
  columns: number;
  gap: number;
  mobile: boolean;
  tileSize: number;
  yearHeader: number;
  monthHeader: number;
  dayHeader: number;
  dayGroupSpacing: number;
}

export function libraryGridLayout(containerWidth: number, mobile = false): LibraryGridLayout {
  const columns = libraryGridColumns(containerWidth);
  const gap = libraryGridGap(containerWidth);
  const tileSize = columns > 0 ? (containerWidth - gap * (columns - 1)) / columns : 0;
  return {
    containerWidth,
    columns,
    gap,
    mobile,
    tileSize,
    yearHeader: mobile ? 0 : 44,
    monthHeader: 32,
    dayHeader: 40,
    dayGroupSpacing: libraryDayGroupSpacing(containerWidth),
  };
}

export interface DaySegment {
  key: string;
  year: number;
  month: number;
  day: number;
  weekday: string;
  uploadFallback: boolean;
  photos: LibraryPhoto[];
  isFirstOfYear: boolean;
  isFirstOfMonth: boolean;
  undated: boolean;
  height: number;
  offset: number;
}

export interface MonthAnchor {
  key: string;
  year: number;
  month: number;
  label: string;
  offset: number;
}

export interface VirtualWindow {
  start: number;
  end: number;
  topSpacer: number;
  bottomSpacer: number;
  totalHeight: number;
}

export interface StickyContext {
  year: number;
  month: number;
  undated: boolean;
}

const DEFAULT_OVERSCAN_PX = 900;

export function buildDaySegments(groups: TimeGroups, layout: LibraryGridLayout): DaySegment[] {
  const segments: DaySegment[] = [];
  let offset = 0;
  let lastYear: number | null = null;
  let lastMonthKey: string | null = null;

  for (const year of groups.years) {
    for (const month of year.months) {
      for (const day of month.days) {
        const isFirstOfYear = lastYear !== year.year;
        const monthKey = `${year.year}-${month.month}`;
        const isFirstOfMonth = lastMonthKey !== monthKey;
        lastYear = year.year;
        lastMonthKey = monthKey;
        const height = segmentBlockHeight(
          {
            photos: day.photos,
            undated: false,
          },
          layout,
        );
        segments.push({
          key: day.key,
          year: year.year,
          month: month.month,
          day: day.day,
          weekday: day.weekday,
          uploadFallback: day.uploadFallback,
          photos: day.photos,
          isFirstOfYear,
          isFirstOfMonth,
          undated: false,
          height,
          offset,
        });
        offset += height;
      }
    }
  }

  if (groups.undated.length > 0) {
    const height = segmentBlockHeight({ photos: groups.undated, undated: true }, layout);
    segments.push({
      key: "undated",
      year: 0,
      month: 0,
      day: 0,
      weekday: "",
      uploadFallback: false,
      photos: groups.undated,
      isFirstOfYear: true,
      isFirstOfMonth: true,
      undated: true,
      height,
      offset,
    });
  }

  return segments;
}

export function buildMonthAnchors(segments: readonly DaySegment[]): MonthAnchor[] {
  const anchors: MonthAnchor[] = [];
  let lastKey: string | null = null;
  for (const segment of segments) {
    if (segment.undated) continue;
    const key = `${segment.year}-${segment.month}`;
    if (key === lastKey) continue;
    lastKey = key;
    anchors.push({
      key,
      year: segment.year,
      month: segment.month,
      label: `${segment.year} · ${segment.month} 月`,
      offset: segment.offset,
    });
  }
  return anchors;
}

/** 视口顶缘对应的年/月（伪吸顶文案）；日组高度不含年/月头。 */
export function stickyContextAtScroll(
  segments: readonly DaySegment[],
  scrollTop: number,
): StickyContext | null {
  if (segments.length === 0) return null;
  const index = findSegmentAt(segments, scrollTop);
  const segment = segments[index];
  if (!segment) return null;
  if (segment.undated) return { year: 0, month: 0, undated: true };
  return { year: segment.year, month: segment.month, undated: false };
}

export function virtualWindowForScroll(
  segments: readonly DaySegment[],
  scrollTop: number,
  viewportHeight: number,
  _layout: LibraryGridLayout,
  overscanPx = DEFAULT_OVERSCAN_PX,
): VirtualWindow {
  const totalHeight = segments.length > 0 ? segments[segments.length - 1]!.offset + segments[segments.length - 1]!.height : 0;
  if (segments.length === 0) {
    return { start: 0, end: -1, topSpacer: 0, bottomSpacer: 0, totalHeight: 0 };
  }
  const viewStart = Math.max(0, scrollTop - overscanPx);
  const viewEnd = scrollTop + viewportHeight + overscanPx;

  let start = findSegmentAt(segments, viewStart);
  let end = findSegmentAt(segments, viewEnd);
  if (end < start) end = start;

  const topSpacer = segments[start]!.offset;
  const last = segments[end]!;
  const bottomSpacer = Math.max(0, totalHeight - (last.offset + last.height));

  return { start, end, topSpacer, bottomSpacer, totalHeight };
}

/** 视口内日组之外仍可能渲染的格子数上限（用于自测）。 */
export function maxRenderedTiles(
  segments: readonly DaySegment[],
  window: VirtualWindow,
  _layout: LibraryGridLayout,
): number {
  if (window.end < window.start) return 0;
  let tiles = 0;
  for (let index = window.start; index <= window.end; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    tiles += segment.photos.length;
  }
  return tiles;
}

/** 日组块高度：仅日头 + 方格网格（年/月由伪吸顶层承担）。 */
export function segmentBlockHeight(
  segment: Pick<DaySegment, "photos" | "undated">,
  layout: LibraryGridLayout,
): number {
  const headerPx = layout.dayHeader;
  const rows = Math.max(1, Math.ceil(segment.photos.length / layout.columns));
  const grid = rows * layout.tileSize + Math.max(0, rows - 1) * layout.gap;
  return headerPx + grid + layout.dayGroupSpacing;
}

function findSegmentAt(segments: readonly DaySegment[], offset: number): number {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const segment = segments[mid]!;
    const end = segment.offset + segment.height;
    if (offset < segment.offset) high = mid - 1;
    else if (offset >= end) low = mid + 1;
    else return mid;
  }
  return Math.min(Math.max(low, 0), segments.length - 1);
}
