import { PRESIGN_TTL_DEFAULT_MINUTES } from "./storage.js";

/** 上传允许的原图类型。不含 SVG（可携带脚本）。 */
export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AllowedUploadContentType = (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number];

/** 25 MiB。单张原图默认上限。 */
export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** 即使调高 MAX_UPLOAD_BYTES，也不能超过 50 MiB。 */
export const ABSOLUTE_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const SAFE_STORAGE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** userId / assetId 会进入对象键，拒绝路径穿越和空格。 */
export function isSafeStorageId(value: string): boolean {
  return SAFE_STORAGE_ID.test(value);
}

export function normalizeContentType(mime: string): string {
  const [base] = mime.split(";", 1);
  return (base ?? "").trim().toLowerCase();
}

export function isAllowedUploadContentType(
  mime: string,
): mime is AllowedUploadContentType {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(
    normalizeContentType(mime),
  );
}

/**
 * 空值或非法值回落到默认 25 MiB，再夹到绝对上限。
 * 只接受十进制整数字符串。
 */
export function resolveMaxUploadBytes(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_UPLOAD_BYTES;
  if (!/^\d+$/.test(raw.trim())) return DEFAULT_MAX_UPLOAD_BYTES;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) return DEFAULT_MAX_UPLOAD_BYTES;
  return Math.min(n, ABSOLUTE_MAX_UPLOAD_BYTES);
}

/**
 * 未完成上传的最短保留时间。
 * 预签名最长 15 分钟，两倍仍短于一小时，因此默认至少 60 分钟。
 */
export const PENDING_UPLOAD_MIN_TTL_MINUTES = 60;

/** 显式 TTL 超过 7 天视为配错，回落默认，避免清理被关掉。 */
export const PENDING_UPLOAD_TTL_MAX_MINUTES = 7 * 24 * 60;

/** 每个用户同时处于 pending_upload 的资产上限。 */
export const DEFAULT_MAX_PENDING_UPLOADS_PER_USER = 50;

/** 上限配得过大视为配错，回落默认。 */
export const MAX_PENDING_UPLOADS_PER_USER_CAP = 1_000;

/** 每一轮清理最多处理的行数。 */
export const DEFAULT_PENDING_UPLOAD_CLEANUP_BATCH = 50;

export const MAX_PENDING_UPLOAD_CLEANUP_BATCH = 500;

/** Worker 上清理任务的默认间隔。 */
export const DEFAULT_PENDING_UPLOAD_CLEANUP_INTERVAL_MINUTES = 10;

export const MAX_PENDING_UPLOAD_CLEANUP_INTERVAL_MINUTES = 24 * 60;

/**
 * 默认清理阈值：预签名 TTL 的两倍，并且不少于 1 小时。
 * presignTtlMinutes 在运行配置里已经被夹到 5–15，这里仍按传入值计算，方便单测。
 */
export function pendingUploadTtlFloorMinutes(presignTtlMinutes: number): number {
  const presign = Number.isFinite(presignTtlMinutes)
    ? Math.trunc(presignTtlMinutes)
    : PRESIGN_TTL_DEFAULT_MINUTES;
  const safe = presign > 0 ? presign : PRESIGN_TTL_DEFAULT_MINUTES;
  return Math.max(safe * 2, PENDING_UPLOAD_MIN_TTL_MINUTES);
}

/**
 * 空值或非法值回落默认。
 * 比下限更短、或超过 7 天，也回落默认，避免还在传的对象被清掉，或清理被放得过远。
 */
export function resolvePendingUploadTtlMinutes(
  raw: string | undefined,
  presignTtlMinutes: number,
): number {
  const fallback = pendingUploadTtlFloorMinutes(presignTtlMinutes);
  const parsed = parsePositiveInt(raw);
  if (parsed === null || parsed < fallback || parsed > PENDING_UPLOAD_TTL_MAX_MINUTES) {
    return fallback;
  }
  return parsed;
}

export function resolveMaxPendingUploadsPerUser(raw: string | undefined): number {
  return resolveBoundedInt(
    raw,
    DEFAULT_MAX_PENDING_UPLOADS_PER_USER,
    MAX_PENDING_UPLOADS_PER_USER_CAP,
  );
}

export function resolvePendingUploadCleanupBatch(raw: string | undefined): number {
  return resolveBoundedInt(
    raw,
    DEFAULT_PENDING_UPLOAD_CLEANUP_BATCH,
    MAX_PENDING_UPLOAD_CLEANUP_BATCH,
  );
}

export function resolvePendingUploadCleanupIntervalMinutes(raw: string | undefined): number {
  return resolveBoundedInt(
    raw,
    DEFAULT_PENDING_UPLOAD_CLEANUP_INTERVAL_MINUTES,
    MAX_PENDING_UPLOAD_CLEANUP_INTERVAL_MINUTES,
  );
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

/** 空值用 fallback。非正整数或超过上限也回落 fallback，不夹紧。 */
function resolveBoundedInt(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = parsePositiveInt(raw);
  if (parsed === null || parsed > max) return fallback;
  return parsed;
}

/** 文件名只作元数据，不进入对象键。拒绝路径和控制字符。 */
export function sanitizeFilename(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 255) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..")
  ) {
    return null;
  }
  return trimmed;
}
