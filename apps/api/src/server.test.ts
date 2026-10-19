import assert from "node:assert/strict";
import test from "node:test";
import { JOB_NAMES, derivativeObjectKey, originalObjectKey } from "@memora/shared";
import type { AssetStatus } from "@memora/storage";
import {
  ENV,
  TEST_PASSWORD,
  createTestApp,
  fakeJobs,
  fakeObjects,
  getJson,
  memoryAssets,
  postJson,
  record,
  registerSession,
  withServer,
} from "./test-app.js";

test("upload-url returns key, url, and expiry without logging the signature", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects();
  const jobs = fakeJobs();
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  const password = "unique-log-secret-1";
  try {
    const { app } = createTestApp({ assets, objects, jobs });
    await withServer(app, async (base) => {
      const session = await registerSession(base, "logger@memora.test", password);
      const response = await postJson(
        base,
        "/api/v1/assets/upload-url",
        {
          filename: "trip.jpg",
          mime: "image/jpeg",
          size: 100,
          userId: "someone-else",
        },
        session.cookie,
      );
      assert.equal(response.status, 201);
      const body = response.body as {
        assetId: string;
        key: string;
        url: string;
        expiresAt: string;
        method: string;
        headers: Record<string, string>;
      };
      assert.equal(body.key, originalObjectKey(session.user.id, body.assetId));
      assert.equal(body.key.includes("someone-else"), false);
      assert.match(body.url, /X-Amz-Signature=supersecret/);
      assert.equal(body.method, "PUT");
      assert.equal(body.headers["Content-Type"], "image/jpeg");
      assert.equal(body.expiresAt, "2026-01-01T00:10:00.000Z");
      assert.equal(assets.rows.get(body.assetId)?.status, "pending_upload");
      assert.equal(assets.rows.get(body.assetId)?.userId, session.user.id);
      assert.equal(logs.some((line) => line.includes("supersecret")), false);
      assert.equal(logs.some((line) => line.includes(body.url)), false);
      assert.equal(logs.some((line) => line.includes(password)), false);
      assert.equal(logs.some((line) => line.includes(session.cookie.split("=")[1] ?? "")), false);
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
    const { app } = createTestApp({ assets, objects, jobs: fakeJobs() });
    await withServer(app, async (base) => {
      const session = await registerSession(base);
      const rejected = await postJson(
        base,
        "/api/v1/assets/upload-url",
        {
          filename: "x.svg",
          mime: "image/svg+xml",
          size: 10,
        },
        session.cookie,
      );
      assert.equal(rejected.status, 400);
      assert.equal((rejected.body as { error: string }).error, "unsupported_media_type");
      assert.equal(objects.presigns.length, 0);

      const failed = await postJson(
        base,
        "/api/v1/assets/upload-url",
        {
          filename: "trip.jpg",
          mime: "image/jpeg",
          size: 100,
        },
        session.cookie,
      );
      assert.equal(failed.status, 502);
      assert.equal((failed.body as { error: string }).error, "presign_failed");
      assert.equal(assets.rows.size, 0);
      assert.equal(errors.some((line) => line.includes("supersecret")), false);
      assert.equal(errors.some((line) => line.includes(TEST_PASSWORD)), false);
    });
  } finally {
    console.error = original;
  }
});

test("complete enqueues derivative and exif after the object lands", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects();
  const jobs = fakeJobs();
  const { app } = createTestApp({ assets, objects, jobs });
  await withServer(app, async (base) => {
    const session = await registerSession(base);
    const pending = record({
      id: "asset1",
      userId: session.user.id,
      status: "pending_upload" as AssetStatus,
    });
    assets.rows.set(pending.id, pending);
    const missing = await postJson(base, "/api/v1/assets/asset1/complete", {}, session.cookie);
    assert.equal(missing.status, 200);
    assert.deepEqual((missing.body as { jobs: string[] }).jobs, [
      JOB_NAMES.MEDIA_DERIVATIVE,
      JOB_NAMES.META_EXIF,
    ]);
    assert.equal(assets.rows.get("asset1")?.status, "uploaded");
    assert.equal(jobs.calls.length, 1);
    assert.equal((jobs.calls[0] as { userId: string }).userId, session.user.id);

    const again = record({
      id: "asset2",
      userId: session.user.id,
      status: "pending_upload",
    });
    assets.rows.set(again.id, again);
    objects.head = async () => null;
    const notReady = await postJson(base, "/api/v1/assets/asset2/complete", {}, session.cookie);
    assert.equal(notReady.status, 409);

    const mismatched = record({
      id: "asset3",
      userId: session.user.id,
      status: "pending_upload",
      sizeBytes: 100,
    });
    assets.rows.set(mismatched.id, mismatched);
    objects.head = async () => ({ contentLength: 50, contentType: "image/jpeg" });
    const wrongSize = await postJson(base, "/api/v1/assets/asset3/complete", {}, session.cookie);
    assert.equal(wrongSize.status, 400);
    assert.equal((wrongSize.body as { error: string }).error, "size_mismatch");

    const wrongType = record({
      id: "asset4",
      userId: session.user.id,
      status: "pending_upload",
    });
    assets.rows.set(wrongType.id, wrongType);
    objects.head = async () => ({ contentLength: 100, contentType: "image/png" });
    const typeResponse = await postJson(
      base,
      "/api/v1/assets/asset4/complete",
      {},
      session.cookie,
    );
    assert.equal(typeResponse.status, 400);
    assert.equal((typeResponse.body as { error: string }).error, "content_type_mismatch");
    assert.equal(jobs.calls.length, 1);
  });
});

test("asset read returns signed previews only and hides the original key and exif", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects();
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const { app } = createTestApp({ assets, objects, jobs: fakeJobs() });
    await withServer(app, async (base) => {
      const session = await registerSession(base);
      const assetId = "asset1";
      const thumb = derivativeObjectKey(session.user.id, assetId, "thumb");
      const preview = derivativeObjectKey(session.user.id, assetId, "preview");
      const original = originalObjectKey(session.user.id, assetId);
      assets.rows.set(
        assetId,
        record({
          id: assetId,
          userId: session.user.id,
          status: "ready",
          filename: "harbor.jpg",
          width: 640,
          height: 480,
          storageKey: original,
          derivatives: { thumb, preview, hero: original },
          exif: {
            hasGps: true,
            lat: 30.1,
            lng: 120.2,
            width: 640,
            format: "jpeg",
            orientation: 6,
            capturedAt: "2020:01:02 03:04:05",
            error: "gps 30.1,120.2",
          },
          error:
            "http://127.0.0.1:9000/memora-local/users/u/originals/asset1?X-Amz-Signature=supersecret",
        }),
      );
      const response = await getJson(base, `/api/v1/assets/${assetId}`, session.cookie);
      assert.equal(response.status, 200);
      assert.equal(response.cacheControl, "private, no-store");
      assert.equal(response.referrerPolicy, "no-referrer");
      const body = response.body as {
        assetId: string;
        filename: string;
        status: string;
        width: number;
        height: number;
        takenAt: string | null;
        uploadedAt: string;
        error: string | null;
        key?: string;
        userId?: string;
        exif?: unknown;
        derivatives?: unknown;
        storageKey?: string;
        previews: { thumb?: { url: string; expiresAt: string }; preview?: { url: string }; hero?: { url: string } };
      };
      assert.deepEqual(Object.keys(body).sort(), [
        "assetId",
        "error",
        "filename",
        "height",
        "previews",
        "status",
        "takenAt",
        "uploadedAt",
        "width",
      ]);
      assert.equal(body.assetId, assetId);
      assert.equal(body.filename, "harbor.jpg");
      assert.equal(body.status, "ready");
      assert.equal(body.width, 640);
      assert.equal(body.height, 480);
      assert.equal(body.takenAt, "2020-01-02T03:04:05");
      assert.equal(body.uploadedAt, "2026-01-01T00:00:00.000Z");
      assert.equal(body.error, null);
      assert.equal(body.key, undefined);
      assert.equal(body.userId, undefined);
      assert.equal(body.exif, undefined);
      assert.equal(body.derivatives, undefined);
      assert.equal(body.storageKey, undefined);
      assert.match(body.previews.thumb?.url ?? "", /\/derivatives\//);
      assert.match(body.previews.thumb?.url ?? "", /X-Amz-Signature=/);
      assert.match(body.previews.preview?.url ?? "", /\/derivatives\//);
      assert.equal(body.previews.thumb?.expiresAt, "2026-01-01T00:10:00.000Z");
      assert.equal(body.previews.hero, undefined);
      const json = JSON.stringify(body);
      assert.equal(json.includes("/originals/"), false);
      assert.equal(json.includes(original), false);
      assert.equal(json.includes("30.1"), false);
      assert.equal(json.includes("120.2"), false);
      assert.equal(json.includes("hasGps"), false);
      assert.equal(json.includes("exif"), false);
      assert.equal(json.includes("jpeg"), false);
      assert.deepEqual(objects.presignGets, [thumb, preview]);
      assert.equal(logs.join("\n").includes("supersecret"), false);
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("asset read presign failures do not echo the signed url", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects({
    presignGetError: new Error(
      "http://127.0.0.1:9000/memora-local/users/u/derivatives/asset1/thumb.webp?X-Amz-Signature=supersecret",
    ),
  });
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const { app } = createTestApp({ assets, objects, jobs: fakeJobs() });
    await withServer(app, async (base) => {
      const session = await registerSession(base);
      const assetId = "asset1";
      assets.rows.set(
        assetId,
        record({
          id: assetId,
          userId: session.user.id,
          status: "ready",
          derivatives: { thumb: derivativeObjectKey(session.user.id, assetId, "thumb") },
          exif: { hasGps: true, lat: 30.1, lng: 120.2, capturedAt: "2020:01:02 03:04:05" },
        }),
      );
      const response = await getJson(base, `/api/v1/assets/${assetId}`, session.cookie);
      assert.equal(response.status, 502);
      assert.equal((response.body as { error: string }).error, "presign_failed");
      const json = JSON.stringify(response.body);
      assert.equal(json.includes("supersecret"), false);
      assert.equal(json.includes("30.1"), false);
      assert.equal(json.includes("/originals/"), false);
      assert.equal(json.includes("exif"), false);
      const text = logs.join("\n");
      assert.equal(text.includes("supersecret"), false);
      assert.equal(text.includes("X-Amz-Signature"), false);
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("misconfigured bucket refuses to presign", async () => {
  const objects = fakeObjects();
  const { app } = createTestApp({
    env: { ...ENV, S3_BUCKET: "other-bucket" },
    assets: memoryAssets(),
    objects,
    jobs: fakeJobs(),
  });
  await withServer(app, async (base) => {
    const session = await registerSession(base);
    const response = await postJson(
      base,
      "/api/v1/assets/upload-url",
      {
        filename: "trip.jpg",
        mime: "image/jpeg",
        size: 100,
      },
      session.cookie,
    );
    assert.equal(response.status, 500);
    assert.equal((response.body as { error: string }).error, "bucket_misconfigured");
    assert.equal(objects.presigns.length, 0);
  });
});

test("upload-url returns 429 when one user already has too many pending uploads", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects();
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const { app } = createTestApp({
      env: { ...ENV, MAX_PENDING_UPLOADS_PER_USER: "1" },
      assets,
      objects,
      jobs: fakeJobs(),
    });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "pending-limit@memora.test");
      const other = await registerSession(base, "pending-other@memora.test");
      assets.rows.set(
        "ready-old",
        record({ id: "ready-old", userId: owner.user.id, status: "ready" }),
      );
      const body = { filename: "trip.jpg", mime: "image/jpeg", size: 100 };
      const first = await postJson(base, "/api/v1/assets/upload-url", body, owner.cookie);
      assert.equal(first.status, 201);
      const limited = await postJson(base, "/api/v1/assets/upload-url", body, owner.cookie);
      assert.equal(limited.status, 429);
      assert.equal((limited.body as { error: string }).error, "too_many_pending_uploads");
      assert.equal("url" in ((limited.body as object) ?? {}), false);
      const pending = [...assets.rows.values()].filter(
        (row) => row.userId === owner.user.id && row.status === "pending_upload",
      );
      assert.equal(pending.length, 1);
      assert.equal(objects.presigns.length, 1);
      const otherUpload = await postJson(base, "/api/v1/assets/upload-url", body, other.cookie);
      assert.equal(otherUpload.status, 201);
      const joined = logs.join("\n");
      assert.equal(joined.includes("X-Amz-Signature"), false);
      assert.equal(joined.includes("supersecret"), false);
      assert.equal(joined.includes("trip.jpg"), false);
    });
  } finally {
    console.log = original;
  }
});
