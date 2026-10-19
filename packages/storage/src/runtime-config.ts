import {
  bucketName,
  clampPresignTtlMinutes,
  resolveMaxUploadBytes,
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

function envBlankToUndefined(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
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
  s3: {
    endpoint: string;
    /** 浏览器可见的对象存储 origin。空则预签名使用 endpoint。 */
    publicEndpoint?: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    kmsKeyId?: string;
  };
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const kms = env.AWS_KMS_KEY_ID?.trim();
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
    presignTtlMinutes: clampPresignTtlMinutes(
      Number(envOptional(env, "PRESIGN_TTL_MINUTES", "10")),
    ),
    s3: {
      endpoint: envOptional(env, "S3_ENDPOINT", "http://127.0.0.1:9000"),
      publicEndpoint: envBlankToUndefined(env, "S3_PUBLIC_ENDPOINT"),
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
