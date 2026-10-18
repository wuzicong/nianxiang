import {
  bucketName,
  clampPresignTtlMinutes,
  type DeployMode,
  type MemoraEnv,
  type StorageBackend,
} from "@memora/shared";

function envOptional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function parseDeployMode(raw: string): DeployMode {
  if (raw === "selfhost" || raw === "cloud") return raw;
  console.warn(`[memora-api] DEPLOY_MODE=${raw} 无效，回落 selfhost`);
  return "selfhost";
}

function parseStorageBackend(raw: string): StorageBackend {
  if (raw === "minio" || raw === "s3") return raw;
  console.warn(`[memora-api] STORAGE_BACKEND=${raw} 无效，回落 minio`);
  return "minio";
}

function parseMemoraEnv(raw: string): MemoraEnv {
  if (raw === "local" || raw === "dev" || raw === "staging" || raw === "prod") {
    return raw;
  }
  console.warn(`[memora-api] MEMORA_ENV=${raw} 无效，回落 local`);
  return "local";
}

const DEV_DB_PASSWORD = "memora-dev-change-me";
const DEV_MINIO_PASSWORD = "memora-dev-change-me";

export const config = {
  port: Number(envOptional("API_PORT", "3001")),
  deployMode: parseDeployMode(envOptional("DEPLOY_MODE", "selfhost")),
  memoraEnv: parseMemoraEnv(envOptional("MEMORA_ENV", "local")),
  storageBackend: parseStorageBackend(envOptional("STORAGE_BACKEND", "minio")),
  databaseUrl: envOptional(
    "DATABASE_URL",
    `postgresql://memora:${DEV_DB_PASSWORD}@127.0.0.1:5432/memora`,
  ),
  redisUrl: envOptional("REDIS_URL", "redis://127.0.0.1:6379"),
  s3: {
    endpoint: envOptional("S3_ENDPOINT", "http://127.0.0.1:9000"),
    region: envOptional("S3_REGION", "us-east-1"),
    bucket: envOptional("S3_BUCKET", "memora-local"),
    accessKeyId: envOptional("S3_ACCESS_KEY_ID", "memora"),
    secretAccessKey: envOptional("S3_SECRET_ACCESS_KEY", DEV_MINIO_PASSWORD),
    forcePathStyle: envOptional("S3_FORCE_PATH_STYLE", "true") === "true",
    kmsKeyId: process.env.AWS_KMS_KEY_ID?.trim() || undefined,
  },
  presignTtlMinutes: clampPresignTtlMinutes(
    Number(envOptional("PRESIGN_TTL_MINUTES", "10")),
  ),
};

/** 配错时只告警，不阻断 P0 本地启动。 */
export function logDeployWarnings(): void {
  const expectedBucket = bucketName(config.memoraEnv);
  if (config.s3.bucket !== expectedBucket) {
    console.warn(
      `[memora-api] S3_BUCKET=${config.s3.bucket} 与约定 ${expectedBucket} 不一致`,
    );
  }
  if (config.deployMode !== "cloud") return;
  if (config.storageBackend !== "s3") {
    console.warn("[memora-api] 云模式应设 STORAGE_BACKEND=s3");
  }
  if (/localhost|127\.0\.0\.1/.test(config.s3.endpoint)) {
    console.warn("[memora-api] 云模式 S3_ENDPOINT 仍指向本机");
  }
  if (!config.s3.kmsKeyId) {
    console.warn("[memora-api] 未配置 AWS_KMS_KEY_ID（SSE-KMS 可配，生产建议开启）");
  }
}

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
