export interface AlbumPreview {
  url: string;
  expiresAt: string;
}

export interface AlbumAssetView {
  assetId: string;
  filename: string;
  status: string;
  width: number | null;
  height: number | null;
  error: string | null;
  /** 拍摄时间（与照片库相同形状），用于成册图注，不是坐标。 */
  takenAt: string | null;
  previews: Partial<Record<"thumb" | "preview" | "hero", AlbumPreview>>;
}

export const PROCESSING_POLL_MS = 2_000;
export const PREVIEW_REFRESH_MS = 4 * 60 * 1000;

const PREVIEW_SIZES = ["thumb", "preview", "hero"] as const;

/** 处理中的状态需要短轮询。就绪后的预览地址会过期，改用更慢的刷新。 */
export function assetNeedsRefresh(status: string): boolean {
  return status === "pending_upload" || status === "uploaded" || status === "processing";
}

export function assetStatusLabel(status: string): string {
  switch (status) {
    case "pending_upload":
      return "等待上传";
    case "uploaded":
      return "排队生成预览";
    case "processing":
      return "正在生成预览";
    case "ready":
      return "已就绪";
    case "failed":
      return "处理失败";
    default:
      return "状态未知";
  }
}

/** 界面文案不承接带签名的地址或密钥形状。 */
export function visibleMessage(message: string | null | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/https?:|x-amz-|signature=|\/originals\/|memora_session=/i.test(message)) return fallback;
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}…` : trimmed;
}

function httpPreviewUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8 || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!url.pathname.includes("/derivatives/")) return null;
    if (url.pathname.includes("/originals/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function readPreview(value: unknown): AlbumPreview | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as { url?: unknown; expiresAt?: unknown };
  const url = httpPreviewUrl(entry.url);
  if (!url || typeof entry.expiresAt !== "string" || entry.expiresAt.length < 1 || entry.expiresAt.length > 64) {
    return null;
  }
  return { url, expiresAt: entry.expiresAt };
}

function parseAsset(value: unknown): AlbumAssetView | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    assetId?: unknown;
    filename?: unknown;
    status?: unknown;
    width?: unknown;
    height?: unknown;
    error?: unknown;
    takenAt?: unknown;
    previews?: unknown;
  };
  if (typeof row.assetId !== "string" || row.assetId.length < 1 || row.assetId.length > 64) return null;
  if (typeof row.filename !== "string" || row.filename.length > 255) return null;
  if (typeof row.status !== "string" || row.status.length > 32) return null;
  const previews: AlbumAssetView["previews"] = {};
  if (row.previews && typeof row.previews === "object") {
    for (const size of PREVIEW_SIZES) {
      const preview = readPreview((row.previews as Record<string, unknown>)[size]);
      if (preview) previews[size] = preview;
    }
  }
  const error =
    typeof row.error === "string" ? visibleMessage(row.error, "") || null : null;
  const takenAt = typeof row.takenAt === "string" && row.takenAt.length <= 40 ? row.takenAt : null;
  return {
    assetId: row.assetId,
    filename: row.filename,
    status: row.status,
    width: typeof row.width === "number" ? row.width : null,
    height: typeof row.height === "number" ? row.height : null,
    error,
    takenAt,
    previews,
  };
}

export function parseAlbumAssets(value: unknown): AlbumAssetView[] {
  if (!Array.isArray(value)) return [];
  const assets: AlbumAssetView[] = [];
  for (const item of value) {
    const asset = parseAsset(item);
    if (asset) assets.push(asset);
  }
  return assets;
}

export function previewUrl(previews: AlbumAssetView["previews"]): string | null {
  return previews.thumb?.url ?? previews.preview?.url ?? previews.hero?.url ?? null;
}

/** 灯箱用大图：preview → hero → thumb，仍走衍生图 URL 校验。 */
export function lightboxUrl(previews: AlbumAssetView["previews"]): string | null {
  return previews.preview?.url ?? previews.hero?.url ?? previews.thumb?.url ?? null;
}

export function albumRefreshDelay(assets: AlbumAssetView[]): number | null {
  if (assets.some((asset) => assetNeedsRefresh(asset.status))) return PROCESSING_POLL_MS;
  if (assets.some((asset) => previewUrl(asset.previews))) return PREVIEW_REFRESH_MS;
  return null;
}
