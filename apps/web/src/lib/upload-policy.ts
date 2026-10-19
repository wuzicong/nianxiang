import { imageMime } from "./uploads";

/** 与 packages/shared uploads 默认一致。 */
export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ABSOLUTE_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function resolveMaxUploadBytes(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_UPLOAD_BYTES;
  if (!/^\d+$/.test(raw.trim())) return DEFAULT_MAX_UPLOAD_BYTES;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) return DEFAULT_MAX_UPLOAD_BYTES;
  return Math.min(n, ABSOLUTE_MAX_UPLOAD_BYTES);
}

/** 同时上传的原图数量上限。 */
export const UPLOAD_CONCURRENCY = 2;

const ACCEPT_ATTR =
  "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";

export function maxUploadBytesFromEnv(): number {
  return resolveMaxUploadBytes(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES);
}

export function uploadAcceptAttribute(): string {
  return ACCEPT_ATTR;
}

export function formatBytesMiB(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  if (mib >= 10 || Number.isInteger(mib)) return `${Math.round(mib)} MB`;
  return `${mib.toFixed(1)} MB`;
}

export function uploadHints(maxBytes = maxUploadBytesFromEnv()): string {
  const limit =
    maxBytes === DEFAULT_MAX_UPLOAD_BYTES
      ? "单张不超过 25 MB"
      : `单张不超过 ${formatBytesMiB(maxBytes)}`;
  return `支持 JPEG、PNG、WebP、GIF，${limit}。`;
}

export function validateUploadFile(
  file: File,
  maxBytes = maxUploadBytesFromEnv(),
): string | null {
  const name = file.name?.trim() || "未命名";
  if (!Number.isFinite(file.size) || file.size < 1) {
    return `「${name}」是空文件，无法上传。`;
  }
  if (file.size > maxBytes) {
    return `「${name}」超过 ${formatBytesMiB(maxBytes)} 上限。`;
  }
  if (!imageMime({ type: file.type, name: file.name })) {
    return `「${name}」格式不支持，请使用 JPEG、PNG、WebP 或 GIF。`;
  }
  return null;
}

export function friendlyUploadError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "上传失败，请稍后重试。";
  if (trimmed.includes("不可达")) return trimmed;
  if (trimmed.includes("只接受")) return trimmed;
  if (trimmed.includes("空文件")) return trimmed;
  if (trimmed === "原图上传失败") {
    return "原图上传失败，可能是网络中断或上传地址已过期，请重试。";
  }
  if (trimmed === "响应不完整") return "服务器响应异常，请稍后重试。";
  if (/stack|trace|exception|Error:|ECONN|HTTP\s*\d/i.test(trimmed)) {
    return "上传失败，请稍后重试。";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "上传失败，请稍后重试。";
  }
  if (/^[\x00-\x7F]+$/.test(trimmed) && trimmed.length > 64) {
    return "上传失败，请稍后重试。";
  }
  return trimmed;
}
