import { derivativeObjectKey, type DerivativeSize } from "@memora/shared";
import type { AssetRepository, ObjectStore } from "@memora/storage";
import { renderDerivatives } from "./render.js";

/**
 * 衍生图键不带内容哈希，覆盖后 CDN 不应永久缓存旧字节。
 */
export const DERIVATIVE_CACHE_CONTROL = "public, max-age=86400";

export interface DerivativeJobInput {
  assetId: string;
  userId: string;
  storageKey: string;
}

export async function runMediaDerivative(
  input: DerivativeJobInput,
  deps: {
    objects: Pick<ObjectStore, "getBuffer" | "putObject">;
    assets: Pick<AssetRepository, "get" | "markProcessing" | "markReady">;
  },
): Promise<void> {
  const asset = await deps.assets.get(input.assetId);
  if (!asset) throw new Error("asset_not_found");
  if (asset.userId !== input.userId || asset.storageKey !== input.storageKey) {
    throw new Error("asset_payload_mismatch");
  }
  if (asset.status === "pending_upload") throw new Error("asset_not_uploaded");

  await deps.assets.markProcessing(asset.id);
  const original = await deps.objects.getBuffer(asset.storageKey);
  const rendered = await renderDerivatives(original);
  const derivatives: Partial<Record<DerivativeSize, string>> = {};
  for (const file of rendered.files) {
    const key = derivativeObjectKey(asset.userId, asset.id, file.size);
    await deps.objects.putObject({
      key,
      body: file.body,
      contentType: "image/webp",
      cacheControl: DERIVATIVE_CACHE_CONTROL,
    });
    derivatives[file.size] = key;
  }
  await deps.assets.markReady(asset.id, derivatives, {
    width: rendered.width,
    height: rendered.height,
  });
}
