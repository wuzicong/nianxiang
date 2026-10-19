import type { PublicShareAsset } from "./share-load";
import { OWNED_PHOTO_ALT, shortShootCaption } from "./owned-album";

/** 分享墙可见图注：仅短拍摄日；无日期或仅 filename 时留空。 */
export function shareGalleryCaption(asset: PublicShareAsset): string {
  return shortShootCaption(asset.takenAt);
}

/** 分享墙 `img` alt：短日期或通用句，禁止 filename。 */
export function shareGalleryAlt(asset: PublicShareAsset): string {
  const caption = shareGalleryCaption(asset);
  return caption || OWNED_PHOTO_ALT;
}
