import type { AssetRepository, ExifSummary, ObjectStore } from "@memora/storage";
import { readImageSummary } from "./render.js";

export async function runMetaExif(
  input: { assetId: string; userId: string },
  deps: {
    objects: Pick<ObjectStore, "getBuffer">;
    assets: Pick<AssetRepository, "get" | "saveExif">;
  },
): Promise<ExifSummary> {
  const asset = await deps.assets.get(input.assetId);
  if (!asset) throw new Error("asset_not_found");
  if (asset.userId !== input.userId) throw new Error("asset_payload_mismatch");
  if (asset.status === "pending_upload") throw new Error("asset_not_uploaded");
  const original = await deps.objects.getBuffer(asset.storageKey);
  const summary = await readImageSummary(original);
  const exif: ExifSummary = {
    width: summary.width,
    height: summary.height,
    format: summary.format,
    orientation: summary.orientation,
    capturedAt: summary.capturedAt,
    hasGps: summary.hasGps,
    lat: summary.lat,
    lng: summary.lng,
  };
  await deps.assets.saveExif(asset.id, exif);
  return exif;
}
