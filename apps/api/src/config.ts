import type { DeployMode, MemoraEnv, StorageBackend } from "@memora/shared";

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v;
}

function envOptional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: Number(envOptional("API_PORT", "3001")),
  deployMode: envOptional("DEPLOY_MODE", "selfhost") as DeployMode,
  memoraEnv: envOptional("MEMORA_ENV", "local") as MemoraEnv,
  storageBackend: envOptional("STORAGE_BACKEND", "minio") as StorageBackend,
  databaseUrl: envOptional(
    "DATABASE_URL",
    "postgresql://memora:memora@localhost:5432/memora",
  ),
  redisUrl: envOptional("REDIS_URL", "redis://localhost:6379"),
  s3: {
    endpoint: envOptional("S3_ENDPOINT", "http://localhost:9000"),
    region: envOptional("S3_REGION", "us-east-1"),
    bucket: envOptional("S3_BUCKET", "memora-local"),
    accessKeyId: envOptional("S3_ACCESS_KEY_ID", "memora"),
    secretAccessKey: envOptional("S3_SECRET_ACCESS_KEY", "memora-dev-secret"),
    forcePathStyle: envOptional("S3_FORCE_PATH_STYLE", "true") === "true",
    kmsKeyId: process.env.AWS_KMS_KEY_ID,
  },
  presignTtlMinutes: Math.min(
    15,
    Math.max(
      5,
      Number(envOptional("PRESIGN_TTL_MINUTES", "10")),
    ),
  ),
};

/** P0：上传占位说明（真实预签名在 P1 实现） */
export function uploadPlaceholderResponse(filename: string, mime: string, size: number) {
  return {
    status: "placeholder",
    message: "P1: 将实现 S3 预签名 PUT；云模式强制私有桶 + 5–15min TTL",
    request: { filename, mime, size },
    security: {
      defaultPrivate: true,
      presignTtlMinutes: config.presignTtlMinutes,
      kmsConfigured: Boolean(config.s3.kmsKeyId),
      deployMode: config.deployMode,
    },
  };
}
