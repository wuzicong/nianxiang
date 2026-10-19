import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PRESIGN_TTL_MAX_MINUTES, PRESIGN_TTL_MIN_MINUTES } from "@memora/shared";
import type { RuntimeConfig } from "./runtime-config.js";

export interface ObjectStoreConfig {
  endpoint: string;
  /**
   * 浏览器能打开的对象存储 origin。容器里 S3_ENDPOINT 往往是 http://minio:9000，
   * 签进 URL 的 Host 必须是浏览器能访问的地址，否则上传和看图都会失败。
   * 留空则与 endpoint 相同。
   */
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  kmsKeyId?: string;
  presignTtlSeconds: number;
}

export interface PresignPutInput {
  key: string;
  contentType: string;
  contentLength: number;
}

export interface PresignPutResult {
  url: string;
  expiresAt: Date;
  headers: Record<string, string>;
}

export interface PresignGetResult {
  url: string;
  expiresAt: Date;
}

export interface HeadResult {
  contentLength: number;
  contentType?: string;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}

export interface ObjectStore {
  presignPut(input: PresignPutInput): Promise<PresignPutResult>;
  presignGet(input: { key: string }): Promise<PresignGetResult>;
  head(key: string): Promise<HeadResult | null>;
  getBuffer(key: string): Promise<Buffer>;
  putObject(input: PutObjectInput): Promise<void>;
}

export function objectStoreConfigFromRuntime(config: RuntimeConfig): ObjectStoreConfig {
  return {
    endpoint: config.s3.endpoint,
    publicEndpoint: config.s3.publicEndpoint,
    region: config.s3.region,
    bucket: config.s3.bucket,
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
    forcePathStyle: config.s3.forcePathStyle,
    kmsKeyId: config.s3.kmsKeyId,
    presignTtlSeconds: config.presignTtlMinutes * 60,
  };
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const named = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    named.name === "NotFound" ||
    named.name === "NoSuchKey" ||
    named.$metadata?.httpStatusCode === 404
  );
}

function encryptionFields(kmsKeyId: string | undefined): Pick<
  PutObjectCommandInput,
  "ServerSideEncryption" | "SSEKMSKeyId"
> {
  if (!kmsKeyId) return {};
  return {
    ServerSideEncryption: "aws:kms",
    SSEKMSKeyId: kmsKeyId,
  };
}

function clientConfig(cfg: ObjectStoreConfig, endpoint: string): S3ClientConfig {
  const trimmed = endpoint.trim();
  return {
    region: cfg.region,
    endpoint: trimmed || undefined,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // MinIO 不接受 SDK 默认附带的 flexible checksum，只在调用方显式要求时计算。
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
}

/** 预签名的 Host 会进签名。公开地址必须是不带路径、查询和口令的 origin。 */
export function resolveSigningEndpoint(publicEndpoint: string | undefined, dataEndpoint: string): string {
  const raw = publicEndpoint?.trim();
  if (!raw) return dataEndpoint;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("S3_PUBLIC_ENDPOINT must be an http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("S3_PUBLIC_ENDPOINT must be http(s)");
  }
  if (url.username || url.password) {
    throw new Error("S3_PUBLIC_ENDPOINT must not include credentials");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("S3_PUBLIC_ENDPOINT must be an origin without a path or query");
  }
  return url.origin;
}

export function createObjectStore(cfg: ObjectStoreConfig): ObjectStore {
  const minTtl = PRESIGN_TTL_MIN_MINUTES * 60;
  const maxTtl = PRESIGN_TTL_MAX_MINUTES * 60;
  if (
    !Number.isInteger(cfg.presignTtlSeconds) ||
    cfg.presignTtlSeconds < minTtl ||
    cfg.presignTtlSeconds > maxTtl
  ) {
    throw new Error(`presign TTL seconds must be within ${minTtl}-${maxTtl}`);
  }
  if (!cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.region) {
    throw new Error("object store bucket, region, and credentials are required");
  }

  const dataEndpoint = cfg.endpoint.trim();
  const signingEndpoint = resolveSigningEndpoint(cfg.publicEndpoint, dataEndpoint);
  const client = new S3Client(clientConfig(cfg, dataEndpoint));
  const signingClient =
    signingEndpoint === dataEndpoint ? client : new S3Client(clientConfig(cfg, signingEndpoint));
  const encryption = encryptionFields(cfg.kmsKeyId);

  return {
    async presignPut(input) {
      const command = new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
        ...encryption,
      });
      const url = await getSignedUrl(signingClient, command, {
        expiresIn: cfg.presignTtlSeconds,
      });
      // S3 预签名器会把 content-type 标成 unsignable。类型约束放在完成接口的 HEAD 上。
      // content-length 仍在签名里，客户端必须传申请时的字节数。
      const headers: Record<string, string> = {
        "Content-Type": input.contentType,
        "Content-Length": String(input.contentLength),
      };
      if (cfg.kmsKeyId) {
        headers["x-amz-server-side-encryption"] = "aws:kms";
        headers["x-amz-server-side-encryption-aws-kms-key-id"] = cfg.kmsKeyId;
      }
      return {
        url,
        expiresAt: new Date(Date.now() + cfg.presignTtlSeconds * 1000),
        headers,
      };
    },

    async presignGet(input) {
      const command = new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: input.key,
      });
      const url = await getSignedUrl(signingClient, command, {
        expiresIn: cfg.presignTtlSeconds,
      });
      return {
        url,
        expiresAt: new Date(Date.now() + cfg.presignTtlSeconds * 1000),
      };
    },

    async head(key) {
      try {
        const out = await client.send(
          new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
        );
        if (out.ContentLength === undefined) return null;
        return {
          contentLength: out.ContentLength,
          contentType: out.ContentType,
        };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async getBuffer(key) {
      const out = await client.send(
        new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
      );
      if (!out.Body) {
        throw new Error("object body empty");
      }
      const bytes = await out.Body.transformToByteArray();
      return Buffer.from(bytes);
    },

    async putObject(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: input.cacheControl,
          ...encryption,
        }),
      );
    },
  };
}
