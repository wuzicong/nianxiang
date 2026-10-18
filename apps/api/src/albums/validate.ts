import { isSafeStorageId, isThemeId, DEFAULT_THEME_ID, type ThemeId } from "@memora/shared";
import { HttpError } from "../http.js";

export const MAX_ASSET_IDS_PER_REQUEST = 50;
const MAX_TITLE_LENGTH = 80;
const MAX_SHARE_TTL_MS = 366 * 24 * 60 * 60 * 1000;

export function parseAlbumTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_request", "标题必填");
  }
  const title = value.trim();
  if (title.length < 1 || title.length > MAX_TITLE_LENGTH) {
    throw new HttpError(400, "invalid_request", "标题需要 1 到 80 个字符");
  }
  if (/[\u0000-\u001f\u007f]/.test(title)) {
    throw new HttpError(400, "invalid_request", "标题不能包含控制字符");
  }
  return title;
}

export function parseThemeId(value: unknown): ThemeId {
  if (value === undefined) return DEFAULT_THEME_ID;
  if (typeof value !== "string" || !isThemeId(value)) {
    throw new HttpError(400, "invalid_theme", "模板不存在");
  }
  return value;
}

/** 省略或 null 表示不过期。过去的时间和超过 366 天的时间都拒绝。 */
export function parseExpiresAt(value: unknown, now = Date.now()): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "invalid_request", "expiresAt 需要是 ISO 时间");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "invalid_request", "expiresAt 需要是 ISO 时间");
  }
  if (parsed.getTime() <= now) {
    throw new HttpError(400, "invalid_request", "过期时间需要晚于现在");
  }
  if (parsed.getTime() - now > MAX_SHARE_TTL_MS) {
    throw new HttpError(400, "invalid_request", "过期时间不能超过 366 天");
  }
  return parsed;
}

export function parseAssetIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ASSET_IDS_PER_REQUEST) {
    throw new HttpError(400, "invalid_request", "assetIds 需要 1 到 50 个素材");
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !isSafeStorageId(item)) {
      throw new HttpError(400, "invalid_request", "素材 id 不合法");
    }
    if (seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
  }
  if (ids.length < 1) {
    throw new HttpError(400, "invalid_request", "assetIds 需要 1 到 50 个素材");
  }
  return ids;
}
