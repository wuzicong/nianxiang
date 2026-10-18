/**
 * 异步 Job 名称（与服务器/Worker 契约冻结，勿随意改名）
 * @see 总册 §3.4
 */
export const JOB_NAMES = {
  MEDIA_DERIVATIVE: "media.derivative",
  META_EXIF: "meta.exif",
  META_GEOCODE: "meta.geocode",
  ML_FACE: "ml.face",
  ML_CLIP: "ml.clip",
  ML_SCENE: "ml.scene",
  SMART_ALBUM_REFRESH: "smart.album.refresh",
  ALBUM_RENDER: "album.render",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const ALL_JOB_NAMES: readonly JobName[] = Object.values(JOB_NAMES);

/** 幂等键：assetId + jobType */
export function jobIdempotencyKey(assetId: string, jobType: JobName): string {
  return `${assetId}:${jobType}`;
}

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface BaseJobPayload {
  traceId?: string;
}

export interface MediaDerivativePayload extends BaseJobPayload {
  assetId: string;
  storageKey: string;
  userId: string;
}

export interface MetaExifPayload extends BaseJobPayload {
  assetId: string;
  userId: string;
}

export interface MetaGeocodePayload extends BaseJobPayload {
  assetId: string;
  userId: string;
  lat: number;
  lng: number;
}

export interface MlAssetPayload extends BaseJobPayload {
  assetId: string;
  userId: string;
  storageKey: string;
}

export interface SmartAlbumRefreshPayload extends BaseJobPayload {
  userId: string;
}

export interface AlbumRenderPayload extends BaseJobPayload {
  albumId: string;
  userId: string;
}
