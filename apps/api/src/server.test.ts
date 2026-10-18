import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { Express } from "express";
import { JOB_NAMES, originalObjectKey } from "@memora/shared";
import type {
  AssetJobEnqueuer,
  AssetRecord,
  AssetRepository,
  AssetStatus,
  ExifSummary,
  HeadResult,
  NewAsset,
  ObjectStore,
  PresignPutInput,
} from "@memora/storage";
import { createConfig } from "./config.js";
import { createApp } from "./server.js";

const ENV = {
  DEPLOY_MODE: "selfhost",
  MEMORA_ENV: "local",
  STORAGE_BACKEND: "minio",
  S3_BUCKET: "memora-local",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_ACCESS_KEY_ID: "memora",
  S3_SECRET_ACCESS_KEY: "test-secret-value",
  PRESIGN_TTL_MINUTES: "10",
  MAX_UPLOAD_BYTES: "1024",
  DATABASE_URL: "postgresql://memora:test@127.0.0.1:5432/memora",
  REDIS_URL: "redis://127.0.0.1:6379",
} satisfies NodeJS.ProcessEnv;

function record(partial: Partial<AssetRecord> & Pick<AssetRecord, "id" | "status">): AssetRecord {
  return {
    userId: "local",
    storageKey: originalObjectKey("local", partial.id),
    filename: "trip.jpg",
    contentType: "image/jpeg",
    sizeBytes: 100,
    width: null,
    height: null,
    derivatives: {},
    exif: null,
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function memoryAssets(seed: AssetRecord[] = []): AssetRepository & { rows: Map<string, AssetRecord> } {
  const rows = new Map(seed.map((row) => [row.id, row]));
  return {
    rows,
    async ready() {},
    async insertPending(asset: NewAsset) {
      rows.set(asset.id, record({
        id: asset.id,
        userId: asset.userId,
        storageKey: asset.storageKey,
        filename: asset.filename,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        status: "pending_upload",
      }));
    },
    async deletePending(id) {
      const current = rows.get(id);
      if (current?.status === "pending_upload") rows.delete(id);
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async markUploaded(id) {
      const current = rows.get(id);
      if (!current) return null;
      if (current.status === "pending_upload") {
        current.status = "uploaded";
      }
      return current;
    },
    async markProcessing() {},
    async markReady() {},
    async markFailed() {},
    async saveExif() {},
    async noteExifFailure() {},
    async close() {},
  };
}

function fakeObjects(options?: {
  head?: HeadResult | null;
  presignError?: Error;
}): ObjectStore & { presigns: PresignPutInput[]; heads: string[] } {
  return {
    presigns: [],
    heads: [],
    async presignPut(input) {
      this.presigns.push(input);
      if (options?.presignError) throw options.presignError;
      return {
        url: `http://127.0.0.1:9000/memora-local/${input.key}?X-Amz-Signature=supersecret`,
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
        headers: {
          "Content-Type": input.contentType,
          "Content-Length": String(input.contentLength),
        },
      };
    },
    async head(key) {
      this.heads.push(key);
      return options?.head === undefined ? { contentLength: 100, contentType: "image/jpeg" } : options.head;
    },
    async getBuffer() {
      return Buffer.alloc(0);
    },
    async putObject() {},
  };
}

function fakeJobs(): AssetJobEnqueuer & { calls: unknown[] } {
  return {
    calls: [],
    async enqueuePipeline(input) {
      this.calls.push(input);
    },
    async close() {},
  };
}

async function withServer(app: Express, fn: (base: string) => Promise<void>) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function post(base: string, path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("upload-url returns key, url, and expiry without logging the signature", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects();
  const jobs = fakeJobs();
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const app = createApp({
      config: createConfig(ENV),
      assets,
      objects,
      jobs,
    });
    await withServer(app, async (base) => {
      const response = await post(base, "/api/v1/assets/upload-url", {
        filename: "trip.jpg",
        mime: "image/jpeg",
        size: 100,
        userId: "local",
      });
      assert.equal(response.status, 201);
      const body = response.body as {
        assetId: string;
        key: string;
        url: string;
        expiresAt: string;
        method: string;
        headers: Record<string, string>;
      };
      assert.equal(body.key, originalObjectKey("local", body.assetId));
      assert.match(body.url, /X-Amz-Signature=supersecret/);
      assert.equal(body.method, "PUT");
      assert.equal(body.headers["Content-Type"], "image/jpeg");
      assert.equal(body.expiresAt, "2026-01-01T00:10:00.000Z");
      assert.equal(assets.rows.get(body.assetId)?.status, "pending_upload");
      assert.equal(logs.some((line) => line.includes("supersecret")), false);
      assert.equal(logs.some((line) => line.includes(body.url)), false);
    });
  } finally {
    console.log = original;
  }
});

test("upload-url rejects bad content type and rolls back a failed presign", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects({
    presignError: new Error(
      "http://127.0.0.1:9000/bucket/key?X-Amz-Signature=supersecret",
    ),
  });
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
  try {
    const app = createApp({
      config: createConfig(ENV),
      assets,
      objects,
      jobs: fakeJobs(),
    });
    await withServer(app, async (base) => {
      const rejected = await post(base, "/api/v1/assets/upload-url", {
        filename: "x.svg",
        mime: "image/svg+xml",
        size: 10,
        userId: "local",
      });
      assert.equal(rejected.status, 400);
      assert.equal((rejected.body as { error: string }).error, "unsupported_media_type");
      assert.equal(objects.presigns.length, 0);

      const failed = await post(base, "/api/v1/assets/upload-url", {
        filename: "trip.jpg",
        mime: "image/jpeg",
        size: 100,
        userId: "local",
      });
      assert.equal(failed.status, 502);
      assert.equal((failed.body as { error: string }).error, "presign_failed");
      assert.equal(assets.rows.size, 0);
      assert.equal(errors.some((line) => line.includes("supersecret")), false);
    });
  } finally {
    console.error = original;
  }
});

test("complete enqueues derivative and exif after the object lands", async () => {
  const pending = record({ id: "asset1", status: "pending_upload" as AssetStatus });
  const assets = memoryAssets([pending]);
  const objects = fakeObjects();
  const jobs = fakeJobs();
  const app = createApp({
    config: createConfig(ENV),
    assets,
    objects,
    jobs,
  });
  await withServer(app, async (base) => {
    const missing = await post(base, "/api/v1/assets/asset1/complete", {});
    assert.equal(missing.status, 200);
    assert.deepEqual((missing.body as { jobs: string[] }).jobs, [
      JOB_NAMES.MEDIA_DERIVATIVE,
      JOB_NAMES.META_EXIF,
    ]);
    assert.equal(assets.rows.get("asset1")?.status, "uploaded");
    assert.equal(jobs.calls.length, 1);

    const again = record({ id: "asset2", status: "pending_upload" });
    assets.rows.set(again.id, again);
    objects.head = async () => null;
    const notReady = await post(base, "/api/v1/assets/asset2/complete", {});
    assert.equal(notReady.status, 409);

    const mismatched = record({ id: "asset3", status: "pending_upload", sizeBytes: 100 });
    assets.rows.set(mismatched.id, mismatched);
    objects.head = async () => ({ contentLength: 50, contentType: "image/jpeg" });
    const wrongSize = await post(base, "/api/v1/assets/asset3/complete", {});
    assert.equal(wrongSize.status, 400);
    assert.equal((wrongSize.body as { error: string }).error, "size_mismatch");

    const wrongType = record({ id: "asset4", status: "pending_upload" });
    assets.rows.set(wrongType.id, wrongType);
    objects.head = async () => ({ contentLength: 100, contentType: "image/png" });
    const typeResponse = await post(base, "/api/v1/assets/asset4/complete", {});
    assert.equal(typeResponse.status, 400);
    assert.equal((typeResponse.body as { error: string }).error, "content_type_mismatch");
    assert.equal(jobs.calls.length, 1);
  });
});

test("asset read model omits GPS coordinates", async () => {
  const exif: ExifSummary = {
    hasGps: true,
    lat: 30.1,
    lng: 120.2,
    width: 10,
    capturedAt: "2020-01-02T00:00:00.000Z",
  };
  const assets = memoryAssets([
    record({ id: "asset1", status: "ready", exif, width: 10 }),
  ]);
  const app = createApp({
    config: createConfig(ENV),
    assets,
    objects: fakeObjects(),
    jobs: fakeJobs(),
  });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/v1/assets/asset1`);
    const body = (await response.json()) as { exif: Record<string, unknown>; status: string };
    assert.equal(response.status, 200);
    assert.equal(body.status, "ready");
    assert.equal(body.exif.hasGps, true);
    assert.equal(body.exif.capturedAt, "2020-01-02T00:00:00.000Z");
    assert.equal("lat" in body.exif, false);
    assert.equal("lng" in body.exif, false);
    assert.equal(JSON.stringify(body).includes("30.1"), false);
  });
});

test("misconfigured bucket refuses to presign", async () => {
  const objects = fakeObjects();
  const app = createApp({
    config: createConfig({ ...ENV, S3_BUCKET: "other-bucket" }),
    assets: memoryAssets(),
    objects,
    jobs: fakeJobs(),
  });
  await withServer(app, async (base) => {
    const response = await post(base, "/api/v1/assets/upload-url", {
      filename: "trip.jpg",
      mime: "image/jpeg",
      size: 100,
      userId: "local",
    });
    assert.equal(response.status, 500);
    assert.equal((response.body as { error: string }).error, "bucket_misconfigured");
    assert.equal(objects.presigns.length, 0);
  });
});
