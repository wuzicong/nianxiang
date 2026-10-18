import { randomUUID } from "node:crypto";
import {
  JOB_NAMES,
  bucketName,
  isSafeStorageId,
  normalizeContentType,
  originalObjectKey,
} from "@memora/shared";
import type {
  AssetJobEnqueuer,
  AssetRecord,
  AssetRepository,
  AuthRepository,
  ExifSummary,
  ObjectStore,
} from "@memora/storage";
import { safeErrorMessage } from "@memora/storage";
import cors from "cors";
import express, { type ErrorRequestHandler, type Express, type Request } from "express";
import {
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "./auth/cookies.js";
import { oidcNotEnabled } from "./auth/oidc.js";
import {
  loginUser,
  registerUser,
  resolveSession,
  revokePresentedSession,
  type PublicUser,
} from "./auth/service.js";
import type { AppConfig } from "./config.js";
import { HttpError, asyncRoute } from "./http.js";
import { asRecord, readTraceId, validateUploadRequest } from "./validate.js";

export interface AppDeps {
  config: AppConfig;
  objects: ObjectStore;
  assets: AssetRepository;
  jobs: AssetJobEnqueuer;
  auth: AuthRepository;
}

function publicExif(exif: ExifSummary | null): Omit<ExifSummary, "lat" | "lng"> | null {
  if (!exif) return null;
  const { lat: _lat, lng: _lng, ...rest } = exif;
  return rest;
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function toPublicAsset(asset: AssetRecord) {
  return {
    assetId: asset.id,
    userId: asset.userId,
    key: asset.storageKey,
    filename: asset.filename,
    contentType: asset.contentType,
    size: asset.sizeBytes,
    status: asset.status,
    width: asset.width,
    height: asset.height,
    derivatives: asset.derivatives,
    exif: publicExif(asset.exif),
    error: asset.error,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

async function headUploaded(objects: ObjectStore, key: string) {
  try {
    return await objects.head(key);
  } catch (err) {
    console.error("[memora-api] head failed", safeErrorMessage(err));
    throw new HttpError(502, "storage_unavailable", "读取对象存储失败");
  }
}

function cookieOptions(config: AppConfig): { secure: boolean; maxAgeSeconds: number } {
  return { secure: config.cookieSecure, maxAgeSeconds: config.sessionTtlSeconds };
}

async function requireUser(deps: AppDeps, req: Request): Promise<PublicUser> {
  await deps.auth.ready();
  const user = await resolveSession(deps.auth, req.header("cookie"));
  if (!user) throw new HttpError(401, "unauthenticated", "请先登录");
  return user;
}

/** 跨用户与不存在用同一个 404，避免靠状态码判断素材是否存在。 */
function assertAssetOwner(asset: AssetRecord, userId: string): void {
  if (asset.userId !== userId) {
    throw new HttpError(404, "asset_not_found", "素材不存在");
  }
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || deps.config.webOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      allowedHeaders: ["content-type", "x-request-id"],
    }),
  );
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "memora-api",
      deployMode: deps.config.deployMode,
      memoraEnv: deps.config.memoraEnv,
      storage: {
        backend: deps.config.storageBackend,
        bucket: deps.config.s3.bucket,
        expectedBucketPattern: bucketName(deps.config.memoraEnv),
      },
      presignTtlMinutes: deps.config.presignTtlMinutes,
    });
  });

  app.post(
    "/api/v1/auth/register",
    asyncRoute(async (req, res) => {
      await deps.auth.ready();
      const body = asRecord(req.body);
      const issued = await registerUser(
        deps.auth,
        { email: body.email, password: body.password },
        {
          registrationOpen: deps.config.registrationOpen,
          sessionTtlSeconds: deps.config.sessionTtlSeconds,
        },
      );
      console.log(`[memora-api] register user=${issued.user.id}`);
      res.setHeader("Set-Cookie", serializeSessionCookie(issued.token, cookieOptions(deps.config)));
      res.status(201).json({ user: issued.user });
    }),
  );

  app.post(
    "/api/v1/auth/login",
    asyncRoute(async (req, res) => {
      await deps.auth.ready();
      const body = asRecord(req.body);
      const issued = await loginUser(
        deps.auth,
        { email: body.email, password: body.password },
        { sessionTtlSeconds: deps.config.sessionTtlSeconds },
      );
      console.log(`[memora-api] login user=${issued.user.id}`);
      res.setHeader("Set-Cookie", serializeSessionCookie(issued.token, cookieOptions(deps.config)));
      res.json({ user: issued.user });
    }),
  );

  app.post(
    "/api/v1/auth/logout",
    asyncRoute(async (req, res) => {
      await deps.auth.ready();
      const user = await resolveSession(deps.auth, req.header("cookie"));
      await revokePresentedSession(deps.auth, req.header("cookie"));
      if (user) console.log(`[memora-api] logout user=${user.id}`);
      res.setHeader(
        "Set-Cookie",
        serializeClearedSessionCookie({ secure: deps.config.cookieSecure }),
      );
      res.status(204).end();
    }),
  );

  app.get(
    "/api/v1/auth/me",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps, req);
      res.json({ user });
    }),
  );

  app.post("/api/v1/auth/oidc/start", (_req, _res, next) => {
    next(oidcNotEnabled());
  });
  app.post("/api/v1/auth/oidc/callback", (_req, _res, next) => {
    next(oidcNotEnabled());
  });

  app.post(
    "/api/v1/assets/upload-url",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps, req);
      const expected = bucketName(deps.config.memoraEnv);
      if (deps.config.s3.bucket !== expected) {
        throw new HttpError(
          500,
          "bucket_misconfigured",
          `S3_BUCKET 必须是 ${expected}`,
        );
      }
      const body = asRecord(req.body);
      const validated = validateUploadRequest({
        filename: body.filename,
        mime: body.mime,
        size: body.size,
        maxBytes: deps.config.maxUploadBytes,
      });
      await deps.assets.ready();
      const assetId = randomUUID();
      const key = originalObjectKey(user.id, assetId);
      await deps.assets.insertPending({
        id: assetId,
        userId: user.id,
        storageKey: key,
        filename: validated.filename,
        contentType: validated.contentType,
        sizeBytes: validated.sizeBytes,
      });
      try {
        const signed = await deps.objects.presignPut({
          key,
          contentType: validated.contentType,
          contentLength: validated.sizeBytes,
        });
        console.log(
          `[memora-api] presign asset=${assetId} user=${user.id} bytes=${validated.sizeBytes} type=${validated.contentType} ttl=${deps.config.presignTtlMinutes}m bucket=${deps.config.s3.bucket}`,
        );
        res.status(201).json({
          assetId,
          key,
          url: signed.url,
          expiresAt: signed.expiresAt.toISOString(),
          method: "PUT",
          headers: signed.headers,
          bucket: deps.config.s3.bucket,
        });
      } catch (err) {
        console.error("[memora-api] presign failed", safeErrorMessage(err));
        try {
          await deps.assets.deletePending(assetId);
        } catch (cleanupErr) {
          console.error("[memora-api] cleanup pending failed", safeErrorMessage(cleanupErr));
        }
        throw new HttpError(502, "presign_failed", "签发上传地址失败");
      }
    }),
  );

  app.post(
    "/api/v1/assets/:assetId/complete",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps, req);
      const assetId = param(req.params.assetId);
      if (!isSafeStorageId(assetId)) {
        throw new HttpError(404, "asset_not_found", "素材不存在");
      }
      await deps.assets.ready();
      let asset = await deps.assets.get(assetId);
      if (!asset) throw new HttpError(404, "asset_not_found", "素材不存在");
      assertAssetOwner(asset, user.id);

      if (asset.status === "pending_upload") {
        const head = await headUploaded(deps.objects, asset.storageKey);
        if (!head) {
          throw new HttpError(409, "upload_not_finished", "原图还没有上传完成");
        }
        if (head.contentLength !== asset.sizeBytes) {
          throw new HttpError(400, "size_mismatch", "对象大小与申请时不一致");
        }
        if (
          head.contentType &&
          normalizeContentType(head.contentType) !== asset.contentType
        ) {
          throw new HttpError(400, "content_type_mismatch", "对象类型与申请时不一致");
        }
        const updated = await deps.assets.markUploaded(asset.id);
        if (!updated) throw new HttpError(404, "asset_not_found", "素材不存在");
        asset = updated;
      }

      try {
        await deps.jobs.enqueuePipeline({
          assetId: asset.id,
          userId: asset.userId,
          storageKey: asset.storageKey,
          traceId: readTraceId(req.header("x-request-id")),
        });
      } catch (err) {
        console.error(`[memora-api] enqueue failed asset=${asset.id}`, safeErrorMessage(err));
        throw new HttpError(502, "enqueue_failed", "任务入队失败，可以重试完成接口");
      }

      console.log(`[memora-api] complete asset=${asset.id} user=${user.id} status=${asset.status}`);
      res.json({
        assetId: asset.id,
        status: asset.status,
        jobs: [JOB_NAMES.MEDIA_DERIVATIVE, JOB_NAMES.META_EXIF],
      });
    }),
  );

  app.get(
    "/api/v1/assets/:assetId",
    asyncRoute(async (req, res) => {
      const user = await requireUser(deps, req);
      const assetId = param(req.params.assetId);
      if (!isSafeStorageId(assetId)) {
        throw new HttpError(404, "asset_not_found", "素材不存在");
      }
      await deps.assets.ready();
      const asset = await deps.assets.get(assetId);
      if (!asset) throw new HttpError(404, "asset_not_found", "素材不存在");
      assertAssetOwner(asset, user.id);
      res.json(toPublicAsset(asset));
    }),
  );

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "invalid_json", message: "请求体不是 JSON" });
      return;
    }
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "57P01") {
      console.error("[memora-api] dependency unavailable", safeErrorMessage(err));
      res.status(503).json({
        error: "metadata_store_unavailable",
        message: "元数据存储暂时不可用",
      });
      return;
    }
    console.error("[memora-api] unhandled", safeErrorMessage(err));
    res.status(500).json({ error: "internal_error", message: "内部错误" });
  };
  app.use(onError);

  return app;
}
