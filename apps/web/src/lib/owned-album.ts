import { assetNeedsRefresh, type AlbumAssetView } from "./album-assets";
import { buildDemoAlbum, type DemoAlbum, type DemoPhoto } from "./album-demo";
import type { AlbumSlot, AlbumTheme } from "./album-theme";

const SIZES = ["hero", "preview", "thumb"] as const;
type PreviewSize = (typeof SIZES)[number];

const SIZE_ORDER: Record<string, PreviewSize[]> = {
  hero: ["hero", "preview", "thumb"],
  "spread-2": ["preview", "hero", "thumb"],
  "polaroid-wall": ["preview", "thumb", "hero"],
};

/** 只接受 http(s) 衍生图地址。原图键、脚本地址和带账号的地址都丢掉。 */
export function isDerivativeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (!url.pathname.includes("/derivatives/")) return false;
    if (url.pathname.includes("/originals/")) return false;
    return true;
  } catch {
    return false;
  }
}

/** 封面优先大图，对页和墙优先中图。三种都没有就空着。 */
export function derivativeSheetUrl(
  previews: AlbumAssetView["previews"],
  slotType: string,
): string | null {
  const order = SIZE_ORDER[slotType] ?? ["preview", "hero", "thumb"];
  for (const size of order) {
    const url = previews[size]?.url;
    if (url && isDerivativeHttpUrl(url)) return url;
  }
  return null;
}

function hasDerivative(asset: AlbumAssetView): boolean {
  return SIZES.some((size) => {
    const url = asset.previews[size]?.url;
    return typeof url === "string" && isDerivativeHttpUrl(url);
  });
}

function photoBudget(slot: AlbumSlot): number {
  if (slot.type === "hero") return 1;
  if (slot.type === "spread-2") return 2;
  if (slot.type === "polaroid-wall") return Math.max(0, slot.max ?? Math.max(slot.min ?? 4, 6));
  return 0;
}

export const OWNED_PHOTO_ALT = "相册里的一张照片";

const LITERAL_TAKEN = /^(\d{4})-(\d{2})-(\d{2})T/;

/** 成册图注：有拍摄日则短日期（如 2024.5），否则留空。 */
export function shortShootCaption(takenAt: string | null | undefined): string {
  if (!takenAt) return "";
  const match = LITERAL_TAKEN.exec(takenAt.trim());
  if (!match) return "";
  const year = match[1];
  const month = Number(match[2]);
  if (!month || month > 12) return "";
  return `${year}.${month}`;
}

export interface OwnedAlbumFill {
  album: DemoAlbum;
  placed: number;
  ready: number;
  pending: number;
  unavailable: number;
}

/**
 * 按主题槽位顺序填这本相册。
 * 句子仍用模板文案；照片只来自已签发的衍生图，一张只用一次。
 */
export function buildOwnedAlbum(
  theme: AlbumTheme,
  input: { title: string; assets: AlbumAssetView[] },
): OwnedAlbumFill {
  const demo = buildDemoAlbum(theme);
  const usable: AlbumAssetView[] = [];
  let pending = 0;
  let unavailable = 0;
  for (const asset of input.assets) {
    if (hasDerivative(asset)) {
      usable.push(asset);
      continue;
    }
    if (assetNeedsRefresh(asset.status)) pending += 1;
    else unavailable += 1;
  }

  let cursor = 0;
  let placed = 0;
  const slots = theme.slots.map((slot) => {
    const copy = demo.slots.find((item) => item.id === slot.id);
    const photos: DemoPhoto[] = [];
    const budget = photoBudget(slot);
    while (photos.length < budget && cursor < usable.length) {
      const asset = usable[cursor];
      cursor += 1;
      if (!asset) break;
      const src = derivativeSheetUrl(asset.previews, slot.type);
      if (!src) continue;
      const caption = shortShootCaption(asset.takenAt);
      photos.push({
        id: asset.assetId,
        alt: OWNED_PHOTO_ALT,
        caption,
        src,
      });
      placed += 1;
    }
    const base = copy ?? {
      id: slot.id,
      type: slot.type,
      hint: slot.hint,
      kicker: slot.hint ?? slot.id,
      title: slot.hint ?? slot.id,
      body: "",
      photos: [],
      beats: [],
    };
    const isCover = slot.id === "cover";
    return {
      ...base,
      photos,
      title: isCover ? input.title : base.title,
      body: isCover && theme.shareSubtitle ? theme.shareSubtitle : base.body,
    };
  });

  return {
    album: {
      title: input.title,
      subtitle: theme.shareSubtitle,
      slots,
    },
    placed,
    ready: usable.length,
    pending,
    unavailable,
  };
}
