import type { AssetRecord, ExifSummary } from "@memora/storage";

function publicExif(exif: ExifSummary | null): Omit<ExifSummary, "lat" | "lng"> | null {
  if (!exif) return null;
  const { lat: _lat, lng: _lng, ...rest } = exif;
  return rest;
}

export function toPublicAsset(asset: AssetRecord) {
  return {
    assetId: asset.id,
    userId: asset.userId,
    key: asset.storageKey,
    filename: asset.filename,
    contentType: asset.contentType,
    size: asset.sizeBytes,
    status: asset.status,
    width: asset.width,
    height: asset.height,
    derivatives: asset.derivatives,
    exif: publicExif(asset.exif),
    error: asset.error,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}
