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
