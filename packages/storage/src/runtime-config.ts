import {
  bucketName,
  clampPresignTtlMinutes,
  resolveMaxPendingUploadsPerUser,
  resolveMaxUploadBytes,
  resolvePendingUploadCleanupBatch,
  resolvePendingUploadCleanupIntervalMinutes,
  resolvePendingUploadTtlMinutes,
  type DeployMode,
  type MemoraEnv,
  type StorageBackend,
} from "@memora/shared";

const DEV_DB_PASSWORD = "memora-dev-change-me";
const DEV_MINIO_PASSWORD = "memora-dev-change-me";

function envOptional(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key];
  return value === undefined || value === "" ? fallback : value;
}

function parseDeployMode(raw: string): DeployMode {
  if (raw === "selfhost" || raw === "cloud") return raw;
  console.warn(`[memora] DEPLOY_MODE=${raw} 无效，回落 selfhost`);
  return "selfhost";
}

function parseStorageBackend(raw: string): StorageBackend {
  if (raw === "minio" || raw === "s3") return raw;
  console.warn(`[memora] STORAGE_BACKEND=${raw} 无效，回落 minio`);
  return "minio";
}

function parseMemoraEnv(raw: string): MemoraEnv {
  if (raw === "local" || raw === "dev" || raw === "staging" || raw === "prod") {
    return raw;
  }
  console.warn(`[memora] MEMORA_ENV=${raw} 无效，回落 local`);
  return "local";
}

export interface RuntimeConfig {
  deployMode: DeployMode;
  memoraEnv: MemoraEnv;
  storageBackend: StorageBackend;
  databaseUrl: string;
  redisUrl: string;
  maxUploadBytes: number;
  presignTtlMinutes: number;
  /** 超过这个分钟数的 pending_upload 可以由 Worker 清理。 */
  pendingUploadTtlMinutes: number;
  /** 同一用户未完成上传的数量上限。超过后 upload-url 返回 429。 */
  maxPendingUploadsPerUser: number;
  /** 每一轮清理最多处理多少行。 */
  pendingUploadCleanupBatch: number;
  /** 清理任务的重复间隔。 */
  pendingUploadCleanupIntervalMinutes: number;
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    kmsKeyId?: string;
  };
}

/**
 * 非法配置只说回落后的数字，不回显原值。
 * 环境变量里偶尔会被贴入口令，清理相关日志也不携带这些字符串。
 */
function noted(
  key: string,
  raw: string | undefined,
  resolve: (raw: string | undefined) => number,
): number {
  const resolved = resolve(raw);
  if (raw === undefined || raw.trim() === "") return resolved;
  if (!/^\d+$/.test(raw.trim()) || Number(raw.trim()) !== resolved) {
    console.warn(`[memora] ${key} 无效，回落 ${resolved}`);
  }
  return resolved;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const kms = env.AWS_KMS_KEY_ID?.trim();
  const presignTtlMinutes = clampPresignTtlMinutes(
    Number(envOptional(env, "PRESIGN_TTL_MINUTES", "10")),
  );
  return {
    deployMode: parseDeployMode(envOptional(env, "DEPLOY_MODE", "selfhost")),
    memoraEnv: parseMemoraEnv(envOptional(env, "MEMORA_ENV", "local")),
    storageBackend: parseStorageBackend(envOptional(env, "STORAGE_BACKEND", "minio")),
    databaseUrl: envOptional(
      env,
      "DATABASE_URL",
      `postgresql://memora:${DEV_DB_PASSWORD}@127.0.0.1:5432/memora`,
    ),
    redisUrl: envOptional(env, "REDIS_URL", "redis://127.0.0.1:6379"),
    maxUploadBytes: resolveMaxUploadBytes(env.MAX_UPLOAD_BYTES),
    presignTtlMinutes,
    pendingUploadTtlMinutes: noted("PENDING_UPLOAD_TTL_MINUTES", env.PENDING_UPLOAD_TTL_MINUTES, (raw) =>
      resolvePendingUploadTtlMinutes(raw, presignTtlMinutes),
    ),
    maxPendingUploadsPerUser: noted(
      "MAX_PENDING_UPLOADS_PER_USER",
      env.MAX_PENDING_UPLOADS_PER_USER,
      resolveMaxPendingUploadsPerUser,
    ),
    pendingUploadCleanupBatch: noted(
      "PENDING_UPLOAD_CLEANUP_BATCH",
      env.PENDING_UPLOAD_CLEANUP_BATCH,
      resolvePendingUploadCleanupBatch,
    ),
    pendingUploadCleanupIntervalMinutes: noted(
      "PENDING_UPLOAD_CLEANUP_INTERVAL_MINUTES",
      env.PENDING_UPLOAD_CLEANUP_INTERVAL_MINUTES,
      resolvePendingUploadCleanupIntervalMinutes,
    ),
    s3: {
      endpoint: envOptional(env, "S3_ENDPOINT", "http://127.0.0.1:9000"),
      region: envOptional(env, "S3_REGION", "us-east-1"),
      bucket: envOptional(env, "S3_BUCKET", "memora-local"),
      accessKeyId: envOptional(env, "S3_ACCESS_KEY_ID", "memora"),
      secretAccessKey: envOptional(env, "S3_SECRET_ACCESS_KEY", DEV_MINIO_PASSWORD),
      forcePathStyle: envOptional(env, "S3_FORCE_PATH_STYLE", "true") === "true",
      kmsKeyId: kms || undefined,
    },
  };
}

export function expectedBucket(config: RuntimeConfig): string {
  return bucketName(config.memoraEnv);
}

export function bucketMatchesContract(config: RuntimeConfig): boolean {
  return config.s3.bucket === expectedBucket(config);
}

/** 配错时只告警，不阻断进程启动。上传接口会拒绝错误桶名。 */
export function runtimeWarnings(config: RuntimeConfig): string[] {
  const warnings: string[] = [];
  const expected = expectedBucket(config);
  if (config.s3.bucket !== expected) {
    warnings.push(`S3_BUCKET=${config.s3.bucket} 与约定 ${expected} 不一致`);
  }
  if (config.deployMode === "cloud" && config.storageBackend !== "s3") {
    warnings.push("云模式应设 STORAGE_BACKEND=s3");
  }
  if (config.deployMode === "cloud" && /localhost|127\.0\.0\.1/.test(config.s3.endpoint)) {
    warnings.push("云模式 S3_ENDPOINT 仍指向本机");
  }
  if (config.deployMode === "cloud" && !config.s3.kmsKeyId) {
    warnings.push("未配置 AWS_KMS_KEY_ID（SSE-KMS 可配，生产建议开启）");
  }
  if (
    config.deployMode === "cloud" &&
    config.s3.secretAccessKey === DEV_MINIO_PASSWORD
  ) {
    warnings.push("云模式仍在使用开发用对象存储口令");
  }
  return warnings;
}
