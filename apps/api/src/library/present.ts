import type { AssetRecord, ObjectStore } from "@memora/storage";
import { HttpError } from "../http.js";
import { signStoredDerivatives, type SignedDerivative } from "../albums/present.js";

/** 一页最多签这么多张，避免一次预签名打满对象存储。 */
export const LIBRARY_PAGE_LIMIT = 240;

const EXIF_STAMP = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const LITERAL_STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const ISO_STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export interface LibraryAssetView {
  assetId: string;
  filename: string;
  status: string;
  width: number | null;
  height: number | null;
  error: string | null;
  /** 无时区的相机时间，或带时区的 ISO。不是坐标。 */
  capturedAt: string | null;
  createdAt: string;
  previews: Partial<Record<"thumb" | "preview" | "hero", SignedDerivative>>;
}

/**
 * 照片库列表给浏览器的形状。
 * 只签衍生图；库存里写成原图键的尺寸会被 signStoredDerivatives 丢掉。
 * capturedAt 只接受日期形状。不要把 exif.lat / lng / hasGps 抄进响应。
 * 地点、场景、人物还没有字段。以后若要加地名，只能加地理编码写回的名字，不能加坐标。
 */
export async function presentLibraryAssets(
  assets: AssetRecord[],
  objects: Pick<ObjectStore, "presignGet">,
): Promise<LibraryAssetView[]> {
  const presented: LibraryAssetView[] = [];
  for (const asset of assets) {
    presented.push({
      assetId: asset.id,
      filename: asset.filename,
      status: asset.status,
      width: asset.width,
      height: asset.height,
      error: publicFailure(asset.error),
      capturedAt: libraryCapturedAt(asset.exif),
      createdAt: asset.createdAt,
      previews: await signStoredDerivatives(objects, asset.userId, asset.id, asset.derivatives),
    });
  }
  return presented;
}

export function parseLibraryLimit(value: unknown): number {
  if (value === undefined) return LIBRARY_PAGE_LIMIT;
  if (typeof value !== "string" || !/^[1-9]\d{0,3}$/.test(value)) {
    throw new HttpError(400, "invalid_request", "limit 需要是 1 到 240 的整数");
  }
  const parsed = Number(value);
  if (parsed > LIBRARY_PAGE_LIMIT) {
    throw new HttpError(400, "invalid_request", "limit 需要是 1 到 240 的整数");
  }
  return parsed;
}

/** EXIF 的冒号日期保持相机上的年月日，不换算时区。带时区的 ISO 收成 UTC。 */
export function libraryCapturedAt(exif: unknown): string | null {
  if (!exif || typeof exif !== "object") return null;
  const raw = (exif as { capturedAt?: unknown }).capturedAt;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length > 40) return null;
  const exifStamp = EXIF_STAMP.exec(trimmed);
  if (exifStamp) {
    const literal = `${exifStamp[1]}-${exifStamp[2]}-${exifStamp[3]}T${exifStamp[4]}:${exifStamp[5]}:${exifStamp[6]}`;
    return validLiteral(literal) ? literal : null;
  }
  if (LITERAL_STAMP.test(trimmed)) return validLiteral(trimmed) ? trimmed : null;
  if (!ISO_STAMP.test(trimmed)) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
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

function publicFailure(error: string | null): string | null {
  if (!error) return null;
  const trimmed = error.trim();
  if (!trimmed || trimmed.length > 180) return null;
  if (/https?:|x-amz-|signature=|\/originals\/|memora_session=|gps|lat|lng/i.test(trimmed)) return null;
  if (/-?\d{1,3}\.\d{3,}/.test(trimmed)) return null;
  return trimmed;
}
