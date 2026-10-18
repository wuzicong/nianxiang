import {
  isAllowedUploadContentType,
  isSafeStorageId,
  normalizeContentType,
  sanitizeFilename,
  type AllowedUploadContentType,
} from "@memora/shared";
import { HttpError } from "./http.js";

export interface UploadRequest {
  userId: string;
  filename: string;
  contentType: AllowedUploadContentType;
  sizeBytes: number;
}

export function validateUploadRequest(input: {
  filename: unknown;
  mime: unknown;
  size: unknown;
  userId: unknown;
  maxBytes: number;
}): UploadRequest {
  if (
    typeof input.filename !== "string" ||
    typeof input.mime !== "string" ||
    typeof input.userId !== "string" ||
    typeof input.size !== "number"
  ) {
    throw new HttpError(
      400,
      "invalid_request",
      "filename、mime、size、userId 必填，size 必须是数字",
    );
  }
  if (!Number.isInteger(input.size) || input.size < 1) {
    throw new HttpError(400, "invalid_request", "size 必须是正整数");
  }
  if (input.size > input.maxBytes) {
    throw new HttpError(
      400,
      "payload_too_large",
      `原图不能超过 ${input.maxBytes} 字节`,
    );
  }
  if (!isSafeStorageId(input.userId)) {
    throw new HttpError(
      400,
      "invalid_user",
      "userId 只能包含字母、数字、下划线和连字符",
    );
  }
  const filename = sanitizeFilename(input.filename);
  if (!filename) {
    throw new HttpError(400, "invalid_filename", "文件名不能包含路径或控制字符");
  }
  if (!isAllowedUploadContentType(input.mime)) {
    throw new HttpError(400, "unsupported_media_type", "只接受 jpeg、png、webp、gif");
  }
  return {
    userId: input.userId,
    filename,
    contentType: normalizeContentType(input.mime) as AllowedUploadContentType,
    sizeBytes: input.size,
  };
}

export function readTraceId(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const value = header.trim();
  if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(value)) return undefined;
  return value;
}
