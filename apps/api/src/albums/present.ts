import { DERIVATIVE_SIZES, derivativeObjectKey, type DerivativeSize } from "@memora/shared";
import type {
  AlbumSummary,
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
export async function presentPublicShare(view: PublicShareView, objects: ObjectStore) {
  const assets = [];
  for (const asset of view.assets) {
    const derivatives: Partial<Record<DerivativeSize, SignedDerivative>> = {};
    for (const size of DERIVATIVE_SIZES) {
      const expected = derivativeObjectKey(view.userId, asset.assetId, size);
      if (asset.derivatives[size] !== expected) continue;
      const signed = await objects.presignGet({ key: expected });
      derivatives[size] = {
        url: signed.url,
        expiresAt: signed.expiresAt.toISOString(),
      };
    }
    assets.push({
      assetId: asset.assetId,
      filename: asset.filename,
      width: asset.width,
      height: asset.height,
      derivatives,
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
