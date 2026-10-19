import { DERIVATIVE_SIZES, derivativeObjectKey, type DerivativeSize } from "@memora/shared";
import { libraryTakenAt } from "../library/present.js";
import type {
  AlbumSummary,
  AssetRecord,
  ObjectStore,
  PublicShareView,
  ShareRecord,
} from "@memora/storage";

export function presentAlbum(album: AlbumSummary) {
  return {
    albumId: album.id,
    userId: album.userId,
    title: album.title,
    themeId: album.themeId,
    assetCount: album.assetCount,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
  };
}

export function presentShare(share: ShareRecord) {
  return {
    shareId: share.id,
    albumId: share.albumId,
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    createdAt: share.createdAt,
    passwordProtected: share.passwordProtected,
  };
}

export interface SignedDerivative {
  url: string;
  expiresAt: string;
}

/**
 * 只签属于该用户、该素材的衍生图键。
 * 库存里若被写成原图键或其他前缀，直接跳过，不签发。
 */
export async function signStoredDerivatives(
  objects: Pick<ObjectStore, "presignGet">,
  userId: string,
  assetId: string,
  stored: Partial<Record<DerivativeSize, string>> | null | undefined,
): Promise<Partial<Record<DerivativeSize, SignedDerivative>>> {
  const derivatives: Partial<Record<DerivativeSize, SignedDerivative>> = {};
  const keys = stored ?? {};
  for (const size of DERIVATIVE_SIZES) {
    const expected = derivativeObjectKey(userId, assetId, size);
    if (keys[size] !== expected) continue;
    const signed = await objects.presignGet({ key: expected });
    derivatives[size] = {
      url: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
    };
  }
  return derivatives;
}

/** 相册主人看到的素材。不含原图键、原始衍生图键和完整 EXIF（仅 normalized 拍摄时间）。 */
export async function presentOwnedAlbumAssets(
  assets: AssetRecord[],
  objects: Pick<ObjectStore, "presignGet">,
) {
  const presented = [];
  for (const asset of assets) {
    presented.push({
      assetId: asset.id,
      filename: asset.filename,
      contentType: asset.contentType,
      size: asset.sizeBytes,
      status: asset.status,
      width: asset.width,
      height: asset.height,
      error: asset.error,
      createdAt: asset.createdAt,
      takenAt: libraryTakenAt(asset.exif),
      previews: await signStoredDerivatives(
        objects,
        asset.userId,
        asset.id,
        asset.derivatives,
      ),
    });
  }
  return presented;
}

export async function presentPublicShare(
  view: PublicShareView,
  objects: Pick<ObjectStore, "presignGet">,
) {
  const assets = [];
  for (const asset of view.assets) {
    assets.push({
      assetId: asset.assetId,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      derivatives: await signStoredDerivatives(
        objects,
        view.userId,
        asset.assetId,
        asset.derivatives,
      ),
    });
  }
  return {
    album: {
      title: view.title,
      themeId: view.themeId,
    },
    assets,
  };
}
