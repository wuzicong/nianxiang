/** 部署模式：自托管 Compose / 云托管 */
export type DeployMode = "selfhost" | "cloud";

/** 存储后端：自托管 MinIO 或云 S3 兼容 */
export type StorageBackend = "s3" | "minio";

export type MemoraEnv = "local" | "dev" | "staging" | "prod";

export const DERIVATIVE_SIZES = ["thumb", "preview", "hero"] as const;
export type DerivativeSize = (typeof DERIVATIVE_SIZES)[number];

/**
 * 桶路径契约（对象 key，不含 bucket 名）
 * memora-{env}/users/{userId}/originals|derivatives/...
 */
export function bucketName(env: MemoraEnv): string {
  return `memora-${env}`;
}

export function originalObjectKey(userId: string, assetId: string): string {
  return `users/${userId}/originals/${assetId}`;
}

export function derivativeObjectKey(
  userId: string,
  assetId: string,
  size: DerivativeSize | `${DerivativeSize}.webp`,
): string {
  const file = size.endsWith(".webp") ? size : `${size}.webp`;
  return `users/${userId}/derivatives/${assetId}/${file}`;
}

export function albumExportKey(albumId: string, jobId: string): string {
  return `albums/${albumId}/exports/${jobId}.pdf`;
}

export function templateAssetPrefix(packId: string): string {
  return `templates/${packId}/assets/`;
}

/** 云模式预签名 TTL 允许范围（分钟）。超出部分在 API 启动时夹紧。 */
export const PRESIGN_TTL_MIN_MINUTES = 5;
export const PRESIGN_TTL_MAX_MINUTES = 15;
export const PRESIGN_TTL_DEFAULT_MINUTES = 10;

/** 非数字或空值回落到默认 10 分钟，再夹紧到 5–15。 */
export function clampPresignTtlMinutes(value: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : PRESIGN_TTL_DEFAULT_MINUTES;
  return Math.min(
    PRESIGN_TTL_MAX_MINUTES,
    Math.max(PRESIGN_TTL_MIN_MINUTES, n),
  );
}
