export interface ParsedExif {
  width?: number;
  height?: number;
  format?: string;
  orientation?: number;
  capturedAt?: string;
  hasGps: boolean;
  lat?: number;
  lng?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function toDecimal(value: unknown, ref: unknown): number | undefined {
  let decimal: number | undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    decimal = Math.abs(value);
  } else if (Array.isArray(value) && value.length >= 3) {
    const parts = value.slice(0, 3).map((part) => Number(part));
    if (parts.every((part) => Number.isFinite(part))) {
      const [degrees, minutes, seconds] = parts;
      decimal = Math.abs(degrees) + Math.abs(minutes) / 60 + Math.abs(seconds) / 3600;
    }
  }
  if (decimal === undefined) return undefined;
  if (ref === "S" || ref === "W") decimal = -decimal;
  return decimal;
}

function capturedAt(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

/** EXIF orientation 5–8 会交换宽高。 */
export function orientedSize(
  width: number | undefined,
  height: number | undefined,
  orientation: number | undefined,
): { width?: number; height?: number } {
  if (!width || !height) return { width, height };
  if (orientation !== undefined && orientation >= 5 && orientation <= 8) {
    return { width: height, height: width };
  }
  return { width, height };
}

/**
 * 同时接受 exif-reader v1（gps/exif）和 v2（GPSInfo/Photo）的结果。
 * 解析失败时当作没有 EXIF，不抛出。
 */
export function extractExifFields(parsed: unknown): ParsedExif {
  const root = asRecord(parsed);
  const gps = asRecord(root?.GPSInfo) ?? asRecord(root?.gps);
  const photo = asRecord(root?.Photo) ?? asRecord(root?.exif);
  const lat = gps ? toDecimal(gps.GPSLatitude, gps.GPSLatitudeRef) : undefined;
  const lng = gps ? toDecimal(gps.GPSLongitude, gps.GPSLongitudeRef) : undefined;
  const hasGps =
    lat !== undefined &&
    lng !== undefined &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;
  return {
    capturedAt: capturedAt(photo?.DateTimeOriginal) ?? capturedAt(photo?.CreateDate),
    hasGps,
    lat: hasGps ? lat : undefined,
    lng: hasGps ? lng : undefined,
  };
}
