import {
  assetNeedsRefresh,
  lightboxUrl,
  parseAlbumAssets,
  previewUrl,
  PROCESSING_POLL_MS,
  PREVIEW_REFRESH_MS,
  type AlbumAssetView,
} from "./album-assets";

/**
 * 照片库的纯逻辑，给页面和测试共用。
 * 时间分组用拍摄时间，没有就用上传时间。
 * 地点 / 场景 / 人物没有数据源，不要在这里编结果。
 * 选择是加选：普通点击切换一张，Shift 把锚点到当前这一段都加进选择，锚点不动。
 * 相册接口一次最多 50 个 id，一本相册最多 200 张。
 */

export const LIBRARY_SELECTION_LIMIT = 200;
export const LIBRARY_ASSET_BATCH = 50;

/** 三套模板 id，和 packages/shared 的 THEME_IDS 保持一致。 */
const LIBRARY_THEME_IDS = ["cotton-candy", "kyoto-lantern", "magazine-heirloom"] as const;

const LITERAL_STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const ISO_STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export interface LibraryPhoto {
  assetId: string;
  filename: string;
  status: string;
  width: number | null;
  height: number | null;
  error: string | null;
  takenAt: string | null;
  uploadedAt: string;
  previews: AlbumAssetView["previews"];
}

export interface PhotoCalendar {
  year: number;
  month: number;
  day: number;
  source: "capture" | "upload";
  sort: number;
}

export interface DayGroup {
  key: string;
  year: number;
  month: number;
  day: number;
  label: string;
  weekday: string;
  uploadFallback: boolean;
  photos: LibraryPhoto[];
}

export interface MonthGroup {
  key: string;
  year: number;
  month: number;
  label: string;
  days: DayGroup[];
}

export interface YearGroup {
  year: number;
  label: string;
  months: MonthGroup[];
}

export interface TimeGroups {
  years: YearGroup[];
  undated: LibraryPhoto[];
}

export interface PlacedTile {
  id: string;
  width: number;
  height: number;
}

type OrderedRow = { id: string; aspect: number };

const MIN_ASPECT = 0.42;
const MAX_ASPECT = 3;

/** 与 API 的 libraryCapturedAt 对齐：只留日期，坐标和别的字符串丢掉。 */
export function normalizeCapturedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 19 || trimmed.length > 40) return null;
  if (LITERAL_STAMP.test(trimmed)) return validLiteral(trimmed) ? trimmed : null;
  if (!ISO_STAMP.test(trimmed)) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parseLibraryPayload(value: unknown): { photos: LibraryPhoto[]; hasMore: boolean } {
  const body =
    value && typeof value === "object" ? (value as { assets?: unknown; hasMore?: unknown }) : {};
  const views = parseAlbumAssets(body.assets);
  const dates = new Map<string, { takenAt: string | null; uploadedAt: string }>();
  if (Array.isArray(body.assets)) {
    for (const item of body.assets) {
      if (!item || typeof item !== "object") continue;
      const row = item as {
        assetId?: unknown;
        takenAt?: unknown;
        uploadedAt?: unknown;
        capturedAt?: unknown;
        createdAt?: unknown;
        exif?: unknown;
      };
      if (typeof row.assetId !== "string") continue;
      dates.set(row.assetId, {
        takenAt:
          normalizeCapturedAt(row.takenAt) ??
          normalizeCapturedAt(row.capturedAt) ??
          normalizeCapturedAt(readExifCaptured(row.exif)),
        uploadedAt: readCreatedAt(row.uploadedAt) ?? readCreatedAt(row.createdAt),
      });
    }
  }
  return {
    photos: views.map((view) => {
      const extra = dates.get(view.assetId);
      return {
        assetId: view.assetId,
        filename: view.filename,
        status: view.status,
        width: view.width,
        height: view.height,
        error: view.error,
        takenAt: extra?.takenAt ?? null,
        uploadedAt: extra?.uploadedAt ?? "",
        previews: view.previews,
      };
    }),
    hasMore: body.hasMore === true,
  };
}

export function photoCalendar(
  photo: Pick<LibraryPhoto, "takenAt" | "uploadedAt">,
  timeZone = "UTC",
): PhotoCalendar | null {
  const captured = normalizeCapturedAt(photo.takenAt);
  if (captured && LITERAL_STAMP.test(captured)) {
    const match = LITERAL_STAMP.exec(captured);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        source: "capture",
        sort: Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6]),
        ),
      };
    }
  }
  if (captured) {
    const zoned = zonedParts(captured, timeZone);
    if (zoned) return { ...zoned, source: "capture" };
  }
  const uploaded = zonedParts(photo.uploadedAt, timeZone);
  if (!uploaded) return null;
  return { ...uploaded, source: "upload" };
}

export function groupPhotosByTime(photos: readonly LibraryPhoto[], timeZone = "UTC"): TimeGroups {
  const years = new Map<number, Map<number, Map<string, DayGroup>>>();
  const undated: LibraryPhoto[] = [];
  const dated: { photo: LibraryPhoto; calendar: PhotoCalendar }[] = [];
  for (const photo of photos) {
    const calendar = photoCalendar(photo, timeZone);
    if (!calendar) {
      undated.push(photo);
      continue;
    }
    dated.push({ photo, calendar });
  }
  dated.sort((a, b) => b.calendar.sort - a.calendar.sort || (a.photo.assetId < b.photo.assetId ? 1 : -1));
  for (const entry of dated) {
    const { year, month, day, source } = entry.calendar;
    const key = dayKey(year, month, day);
    let months = years.get(year);
    if (!months) {
      months = new Map();
      years.set(year, months);
    }
    let days = months.get(month);
    if (!days) {
      days = new Map();
      months.set(month, days);
    }
    let group = days.get(key);
    if (!group) {
      group = {
        key,
        year,
        month,
        day,
        label: `${month}月${day}日`,
        weekday: weekdayLabel(year, month, day),
        uploadFallback: true,
        photos: [],
      };
      days.set(key, group);
    }
    if (source === "capture") group.uploadFallback = false;
    group.photos.push(entry.photo);
  }
  const yearGroups: YearGroup[] = [...years.keys()]
    .sort((a, b) => b - a)
    .map((year) => {
      const months = years.get(year) ?? new Map();
      return {
        year,
        label: String(year),
        months: [...months.keys()]
          .sort((a, b) => b - a)
          .map((month) => ({
            key: `${year}-${String(month).padStart(2, "0")}`,
            year,
            month,
            label: `${month}月`,
            days: [...(months.get(month)?.values() ?? [])].sort((a, b) => b.day - a.day),
          })),
      };
    });
  return { years: yearGroups, undated };
}

export function flattenGroupIds(groups: TimeGroups): string[] {
  const ids: string[] = [];
  for (const year of groups.years) {
    for (const month of year.months) {
      for (const day of month.days) {
        for (const photo of day.photos) ids.push(photo.assetId);
      }
    }
  }
  for (const photo of groups.undated) ids.push(photo.assetId);
  return ids;
}

export function suggestedAlbumTitle(photos: readonly LibraryPhoto[], timeZone = "UTC"): string {
  const days = uniqueDays(photos, timeZone);
  if (days.length === 0) return "未命名相册";
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "未命名相册";
  if (first.key === last.key) return clipTitle(`${first.year}年${first.month}月${first.day}日`);
  return clipTitle(
    `${first.year}年${first.month}月${first.day}日 – ${last.year}年${last.month}月${last.day}日`,
  );
}

export function chronologicalAssetIds(
  photos: readonly LibraryPhoto[],
  selected: readonly string[],
  timeZone = "UTC",
): string[] {
  const chosen = new Set(selected);
  return photos
    .filter((photo) => chosen.has(photo.assetId))
    .map((photo) => ({ photo, calendar: photoCalendar(photo, timeZone) }))
    .sort((a, b) => {
      const aSort = a.calendar?.sort ?? Number.POSITIVE_INFINITY;
      const bSort = b.calendar?.sort ?? Number.POSITIVE_INFINITY;
      if (aSort !== bSort) return aSort - bSort;
      return a.photo.assetId < b.photo.assetId ? -1 : 1;
    })
    .map((entry) => entry.photo.assetId);
}

/** 建册主题卡封面：选择集内时间正序第一张有 preview 的图。 */
export function composeCoverPhoto(
  photos: readonly LibraryPhoto[],
  selected: readonly string[],
  timeZone = "UTC",
): LibraryPhoto | null {
  const byId = new Map(photos.map((photo) => [photo.assetId, photo]));
  for (const id of chronologicalAssetIds(photos, selected, timeZone)) {
    const photo = byId.get(id);
    if (photo && previewUrl(photo.previews)) return photo;
  }
  return null;
}

export function applyPhotoSelection(input: {
  selected: readonly string[];
  orderedIds: readonly string[];
  id: string;
  shift: boolean;
  anchor: string | null;
  gesture?: "toggle" | "add";
  max?: number;
}): { selected: string[]; anchor: string | null; capped: boolean } {
  const max = input.max ?? LIBRARY_SELECTION_LIMIT;
  const gesture = input.gesture ?? "toggle";
  if (!input.orderedIds.includes(input.id)) {
    return { selected: [...input.selected], anchor: input.anchor, capped: false };
  }
  if (
    input.shift &&
    input.anchor &&
    input.orderedIds.includes(input.anchor)
  ) {
    const start = input.orderedIds.indexOf(input.anchor);
    const end = input.orderedIds.indexOf(input.id);
    const range = input.orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1);
    const anchorSelected = input.selected.includes(input.anchor);
    if (anchorSelected) {
      const next = [...input.selected];
      const have = new Set(input.selected);
      let capped = false;
      for (const item of range) {
        if (have.has(item)) continue;
        if (next.length >= max) {
          capped = true;
          break;
        }
        have.add(item);
        next.push(item);
      }
      return { selected: next, anchor: input.anchor, capped };
    }
    const remove = new Set(range);
    return {
      selected: input.selected.filter((item) => !remove.has(item)),
      anchor: input.anchor,
      capped: false,
    };
  }
  if (gesture === "add") {
    if (input.selected.includes(input.id)) {
      return { selected: [...input.selected], anchor: input.id, capped: false };
    }
    if (input.selected.length >= max) {
      return { selected: [...input.selected], anchor: input.anchor, capped: true };
    }
    return { selected: [...input.selected, input.id], anchor: input.id, capped: false };
  }
  if (input.selected.includes(input.id)) {
    return {
      selected: input.selected.filter((item) => item !== input.id),
      anchor: input.id,
      capped: false,
    };
  }
  if (input.selected.length >= max) {
    return { selected: [...input.selected], anchor: input.anchor, capped: true };
  }
  return { selected: [...input.selected, input.id], anchor: input.id, capped: false };
}

export function photoAspect(photo: Pick<LibraryPhoto, "width" | "height">): number {
  if (photo.width && photo.height && photo.width > 0 && photo.height > 0) {
    return photo.width / photo.height;
  }
  return 1;
}

export function libraryLayoutMetrics(containerWidth: number): { targetHeight: number; gap: number } {
  if (containerWidth < 560) return { targetHeight: 132, gap: 8 };
  if (containerWidth < 960) return { targetHeight: 168, gap: 10 };
  return { targetHeight: 196, gap: 12 };
}

/** 每一行铺满容器宽度。最后一行不满时保持目标高度，不再拉高。 */
export function justifyPhotoRows(
  items: readonly { id: string; aspect: number }[],
  containerWidth: number,
  options?: { targetHeight?: number; gap?: number },
): PlacedTile[][] {
  const targetHeight = options?.targetHeight ?? 188;
  const gap = options?.gap ?? 10;
  if (!(containerWidth >= 64) || items.length === 0 || !(targetHeight > 0)) return [];
  const rows: PlacedTile[][] = [];
  let current: OrderedRow[] = [];
  const push = (row: OrderedRow[], fill: boolean) => {
    if (row.length === 0) return;
    const aspects = row.map((item) => item.aspect);
    const height = filledHeight(aspects, containerWidth, gap);
    const naturalWidth =
      aspects.reduce((total, aspect) => total + aspect * targetHeight, 0) +
      gap * Math.max(0, row.length - 1);
    if (fill && height > 0) {
      rows.push(tilesAt(row, height, containerWidth, gap, true));
      return;
    }
    if (naturalWidth > containerWidth && height > 0) {
      rows.push(tilesAt(row, height, containerWidth, gap, true));
      return;
    }
    rows.push(tilesAt(row, targetHeight, containerWidth, gap, false));
  };
  for (const item of items) {
    const next = { id: item.id, aspect: clampAspect(item.aspect) };
    if (current.length > 0) {
      const trial = filledHeight(
        [...current.map((entry) => entry.aspect), next.aspect],
        containerWidth,
        gap,
      );
      if (trial < targetHeight) {
        push(current, true);
        current = [next];
        continue;
      }
    }
    current.push(next);
  }
  push(current, false);
  return rows;
}

export function gridNeighbor(
  rows: readonly (readonly { id: string }[])[],
  focusId: string | null,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End",
): string | null {
  const flat = rows.flat();
  if (flat.length === 0) return null;
  if (key === "Home") return flat[0]?.id ?? null;
  if (key === "End") return flat[flat.length - 1]?.id ?? null;
  let rowIndex = 0;
  let columnIndex = 0;
  let found = false;
  if (focusId) {
    for (let row = 0; row < rows.length; row += 1) {
      const column = rows[row]?.findIndex((tile) => tile.id === focusId) ?? -1;
      if (column >= 0) {
        rowIndex = row;
        columnIndex = column;
        found = true;
        break;
      }
    }
  }
  if (!found) {
    if (key === "ArrowLeft" || key === "ArrowUp") return flat[flat.length - 1]?.id ?? null;
    return flat[0]?.id ?? null;
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const index = flat.findIndex((tile) => tile.id === focusId);
    const next = index + (key === "ArrowRight" ? 1 : -1);
    if (next < 0 || next >= flat.length) return focusId;
    return flat[next]?.id ?? focusId;
  }
  const direction = key === "ArrowDown" ? 1 : -1;
  const nextRow = rows[rowIndex + direction];
  if (!nextRow || nextRow.length === 0) return focusId;
  return nextRow[Math.min(columnIndex, nextRow.length - 1)]?.id ?? focusId;
}

export function batchIds<T>(ids: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.trunc(size));
  const batches: T[][] = [];
  for (let index = 0; index < ids.length; index += step) {
    batches.push(ids.slice(index, index + step));
  }
  return batches;
}

export function libraryRefreshDelay(
  photos: readonly { status: string; previews: LibraryPhoto["previews"] }[],
): number | null {
  if (photos.some((photo) => assetNeedsRefresh(photo.status))) return PROCESSING_POLL_MS;
  if (photos.some((photo) => previewUrl(photo.previews))) return PREVIEW_REFRESH_MS;
  return null;
}

export function validAlbumTitle(value: string): string | null {
  const title = value.trim();
  if (title.length < 1 || title.length > 80) return null;
  if (/[\u0000-\u001f\u007f]/.test(title)) return null;
  return title;
}

export function validThemeId(value: string): string | null {
  return (LIBRARY_THEME_IDS as readonly string[]).includes(value) ? value : null;
}

export function safeAlbumId(value: unknown): string | null {
  return typeof value === "string" && SAFE_ID.test(value) ? value : null;
}

function readExifCaptured(exif: unknown): unknown {
  if (!exif || typeof exif !== "object") return null;
  const row = exif as { capturedAt?: unknown; takenAt?: unknown };
  return row.capturedAt ?? row.takenAt ?? null;
}

/** 处理失败的照片不能选入建册。 */
export function libraryPhotoSelectable(photo: Pick<LibraryPhoto, "status">): boolean {
  return photo.status !== "failed";
}

/** 就绪且有可用衍生图时可打开灯箱。 */
export function libraryPhotoLightboxable(photo: LibraryPhoto): boolean {
  return photo.status === "ready" && lightboxUrl(photo.previews) !== null;
}

/** 按时间网格顺序排列的可灯箱 assetId（含跨组全量列表索引）。 */
export function libraryLightboxIds(photos: LibraryPhoto[], timeZone: string): string[] {
  const byId = new Map(photos.map((photo) => [photo.assetId, photo]));
  return flattenGroupIds(groupPhotosByTime(photos, timeZone)).filter((id) => {
    const photo = byId.get(id);
    return photo ? libraryPhotoLightboxable(photo) : false;
  });
}

/** 灯箱底部说明：本地时区的拍摄或上传时间，不含文件名与 EXIF。 */
export function libraryPhotoCaption(photo: LibraryPhoto, timeZone: string): string {
  const stamp = photo.takenAt ?? photo.uploadedAt;
  if (!stamp) return "日期待定";
  try {
    const d =
      photo.takenAt && LITERAL_STAMP.test(photo.takenAt)
        ? new Date(
            Number(photo.takenAt.slice(0, 4)),
            Number(photo.takenAt.slice(5, 7)) - 1,
            Number(photo.takenAt.slice(8, 10)),
            Number(photo.takenAt.slice(11, 13)),
            Number(photo.takenAt.slice(14, 16)),
          )
        : new Date(stamp);
    const when = new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
    return photo.takenAt ? when : `${when} · 按上传时间`;
  } catch {
    return "日期待定";
  }
}

function readCreatedAt(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!ISO_STAMP.test(trimmed)) return "";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function validLiteral(literal: string): boolean {
  const match = LITERAL_STAMP.exec(literal);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1900 || year > 2100) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function zonedParts(
  iso: string,
  timeZone: string,
): { year: number; month: number; day: number; sort: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const zone = timeZone || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const bag = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const year = Number(bag.year);
    const month = Number(bag.month);
    const day = Number(bag.day);
    if (!year || !month || !day) return null;
    return { year, month, day, sort: date.getTime() };
  } catch {
    if (zone !== "UTC") return zonedParts(iso, "UTC");
    return null;
  }
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekdayLabel(year: number, month: number, day: number): string {
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function uniqueDays(photos: readonly LibraryPhoto[], timeZone: string) {
  const days = new Map<string, { key: string; year: number; month: number; day: number }>();
  for (const photo of photos) {
    const calendar = photoCalendar(photo, timeZone);
    if (!calendar) continue;
    const key = dayKey(calendar.year, calendar.month, calendar.day);
    if (!days.has(key)) days.set(key, { key, year: calendar.year, month: calendar.month, day: calendar.day });
  }
  return [...days.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

function clipTitle(title: string): string {
  return title.length > 80 ? title.slice(0, 80) : title;
}

function clampAspect(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, value));
}

function filledHeight(aspects: number[], width: number, gap: number): number {
  const gaps = gap * Math.max(0, aspects.length - 1);
  const sum = aspects.reduce((total, aspect) => total + aspect, 0);
  if (sum <= 0 || width - gaps <= 0) return 0;
  return (width - gaps) / sum;
}

function tilesAt(
  row: OrderedRow[],
  height: number,
  width: number,
  gap: number,
  fill: boolean,
): PlacedTile[] {
  const tiles = row.map((item) => ({
    id: item.id,
    width: Math.max(1, Math.round(item.aspect * height)),
    height: Math.max(1, Math.round(height)),
  }));
  if (!fill || tiles.length === 0) return tiles;
  const gaps = gap * Math.max(0, tiles.length - 1);
  const drift = Math.round(width - gaps - tiles.reduce((total, tile) => total + tile.width, 0));
  const last = tiles[tiles.length - 1];
  if (last) last.width = Math.max(1, last.width + drift);
  return tiles;
}
