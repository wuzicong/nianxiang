import type { LibraryPhoto } from "./library";

/** 生成大量样例照片，用于虚拟滚动与性能自测（仅衍生图字段，无 GPS/EXIF 明细）。 */
export function generateMockLibraryPhotos(count: number, startYear = 2020): LibraryPhoto[] {
  const photos: LibraryPhoto[] = [];
  const base = Date.UTC(startYear, 0, 1);
  for (let index = 0; index < count; index += 1) {
    const dayOffset = Math.floor(index / 3);
    const stamp = new Date(base + dayOffset * 86_400_000 + (index % 24) * 3_600_000);
    const y = stamp.getUTCFullYear();
    const m = String(stamp.getUTCMonth() + 1).padStart(2, "0");
    const d = String(stamp.getUTCDate()).padStart(2, "0");
    const h = String(stamp.getUTCHours()).padStart(2, "0");
    const min = String(stamp.getUTCMinutes()).padStart(2, "0");
    const sec = String(stamp.getUTCSeconds()).padStart(2, "0");
    const assetId = `mock-${String(index).padStart(5, "0")}`;
    photos.push({
      assetId,
      filename: `${assetId}.jpg`,
      status: "ready",
      width: 1200,
      height: 800,
      error: null,
      takenAt: `${y}-${m}-${d}T${h}:${min}:${sec}`,
      uploadedAt: stamp.toISOString(),
      previews: {
        thumb: {
          url: `https://example.test/derivatives/${assetId}/thumb.webp`,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    });
  }
  return photos;
}
