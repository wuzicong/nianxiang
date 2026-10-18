import assert from "node:assert/strict";
import test from "node:test";
import { JOB_NAMES, originalObjectKey } from "@memora/shared";
import type { AssetStatus, ExifSummary } from "@memora/storage";
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

test("asset read model omits GPS coordinates", async () => {
  const exif: ExifSummary = {
    hasGps: true,
    lat: 30.1,
    lng: 120.2,
    width: 10,
    capturedAt: "2020-01-02T00:00:00.000Z",
  };
  const assets = memoryAssets();
  const { app } = createTestApp({ assets, objects: fakeObjects(), jobs: fakeJobs() });
  await withServer(app, async (base) => {
    const session = await registerSession(base);
    assets.rows.set(
      "asset1",
      record({ id: "asset1", userId: session.user.id, status: "ready", exif, width: 10 }),
    );
    const response = await getJson(base, "/api/v1/assets/asset1", session.cookie);
    const body = response.body as { exif: Record<string, unknown>; status: string; userId: string };
    assert.equal(response.status, 200);
    assert.equal(body.status, "ready");
    assert.equal(body.userId, session.user.id);
    assert.equal(body.exif.hasGps, true);
    assert.equal(body.exif.capturedAt, "2020-01-02T00:00:00.000Z");
    assert.equal("lat" in body.exif, false);
    assert.equal("lng" in body.exif, false);
    assert.equal(JSON.stringify(body).includes("30.1"), false);
  });
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
