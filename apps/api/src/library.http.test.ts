import assert from "node:assert/strict";
import test from "node:test";
import { derivativeObjectKey, originalObjectKey } from "@memora/shared";
import {
  createTestApp,
  fakeObjects,
  getJson,
  memoryAssets,
  record,
  registerSession,
  withServer,
} from "./test-app.js";

function captureLogs() {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return {
    lines,
    restore() {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

test("library list is owner-only and never returns originals or GPS", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects();
  const logs = captureLogs();
  try {
    const { app } = createTestApp({ assets, objects });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "library-owner@memora.test");
      const other = await registerSession(base, "library-other@memora.test");
      const readyId = "ready-photo";
      const thumb = derivativeObjectKey(owner.user.id, readyId, "thumb");
      const preview = derivativeObjectKey(owner.user.id, readyId, "preview");
      const original = originalObjectKey(owner.user.id, readyId);
      assets.rows.set(
        readyId,
        record({
          id: readyId,
          userId: owner.user.id,
          status: "ready",
          filename: "harbor.jpg",
          width: 640,
          height: 480,
          createdAt: "2024-03-02T00:00:00.000Z",
          derivatives: { thumb, preview, hero: original },
          exif: {
            capturedAt: "2020:01:02 03:04:05",
            hasGps: true,
            lat: 12.3456,
            lng: 99.9,
          },
          error: "http://127.0.0.1:9000/memora-local/users/u/originals/ready-photo?X-Amz-Signature=supersecret",
        }),
      );
      assets.rows.set(
        "older-photo",
        record({
          id: "older-photo",
          userId: owner.user.id,
          status: "processing",
          filename: "queue.jpg",
          createdAt: "2020-01-01T00:00:00.000Z",
        }),
      );
      assets.rows.set(
        "secret-photo",
        record({
          id: "secret-photo",
          userId: other.user.id,
          status: "ready",
          filename: "secret.jpg",
          createdAt: "2025-01-01T00:00:00.000Z",
          derivatives: {
            thumb: derivativeObjectKey(other.user.id, "secret-photo", "thumb"),
          },
          exif: { capturedAt: "2019:05:05 01:02:03", hasGps: true, lat: 35.0001, lng: 139.0001 },
        }),
      );

      const anon = await getJson(base, "/api/v1/assets");
      assert.equal(anon.status, 401);

      const listed = await getJson(
        base,
        `/api/v1/assets?userId=${encodeURIComponent(other.user.id)}`,
        owner.cookie,
      );
      assert.equal(listed.status, 200);
      assert.equal(listed.cacheControl, "private, no-store");
      assert.equal(listed.referrerPolicy, "no-referrer");
      const body = listed.body as {
        hasMore: boolean;
        assets: {
          assetId: string;
          filename: string;
          status: string;
          capturedAt: string | null;
          createdAt: string;
          key?: string;
          userId?: string;
          exif?: unknown;
          derivatives?: unknown;
          error: string | null;
          previews: { thumb?: { url: string }; preview?: { url: string }; hero?: { url: string } };
        }[];
      };
      assert.equal(body.hasMore, false);
      assert.deepEqual(
        body.assets.map((asset) => asset.assetId),
        [readyId, "older-photo"],
      );
      assert.equal(body.assets[0]?.capturedAt, "2020-01-02T03:04:05");
      assert.equal(body.assets[0]?.status, "ready");
      assert.match(body.assets[0]?.previews.thumb?.url ?? "", /\/derivatives\//);
      assert.match(body.assets[0]?.previews.preview?.url ?? "", /\/derivatives\//);
      assert.equal(body.assets[0]?.previews.hero, undefined);
      assert.equal(body.assets[0]?.error, null);
      assert.equal(body.assets[0]?.key, undefined);
      assert.equal(body.assets[0]?.userId, undefined);
      assert.equal(body.assets[0]?.exif, undefined);
      assert.equal(body.assets[1]?.previews && Object.keys(body.assets[1].previews).length, 0);
      const json = JSON.stringify(body);
      assert.equal(json.includes("/originals/"), false);
      assert.equal(json.includes("12.3456"), false);
      assert.equal(json.includes("99.9"), false);
      assert.equal(json.includes("35.0001"), false);
      assert.equal(json.includes("hasGps"), false);
      assert.equal(json.includes("secret.jpg"), false);
      assert.equal(json.includes(original), false);
      assert.deepEqual(objects.presignGets, [thumb, preview]);
      assert.equal(logs.lines.join("\n").includes("supersecret"), false);

      const otherList = await getJson(base, "/api/v1/assets", other.cookie);
      const otherBody = otherList.body as { assets: { assetId: string }[] };
      assert.deepEqual(
        otherBody.assets.map((asset) => asset.assetId),
        ["secret-photo"],
      );
    });
  } finally {
    logs.restore();
  }
});

test("library list pages newest uploads and rejects a bad limit", async () => {
  const assets = memoryAssets();
  const { app } = createTestApp({ assets, objects: fakeObjects() });
  await withServer(app, async (base) => {
    const owner = await registerSession(base, "library-page@memora.test");
    assets.rows.set(
      "new-photo",
      record({
        id: "new-photo",
        userId: owner.user.id,
        status: "ready",
        createdAt: "2024-05-01T00:00:00.000Z",
      }),
    );
    assets.rows.set(
      "old-photo",
      record({
        id: "old-photo",
        userId: owner.user.id,
        status: "ready",
        createdAt: "2018-05-01T00:00:00.000Z",
      }),
    );
    const page = await getJson(base, "/api/v1/assets?limit=1", owner.cookie);
    assert.equal(page.status, 200);
    const body = page.body as { hasMore: boolean; assets: { assetId: string }[] };
    assert.equal(body.hasMore, true);
    assert.deepEqual(
      body.assets.map((asset) => asset.assetId),
      ["new-photo"],
    );
    const bad = await getJson(base, "/api/v1/assets?limit=241", owner.cookie);
    assert.equal(bad.status, 400);
    assert.equal((bad.body as { error: string }).error, "invalid_request");
  });
});

test("library presign failures do not echo the signed url", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects({
    presignGetError: new Error(
      "http://127.0.0.1:9000/memora-local/users/u/derivatives/a/thumb.webp?X-Amz-Signature=supersecret",
    ),
  });
  const logs = captureLogs();
  try {
    const { app } = createTestApp({ assets, objects });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "library-presign@memora.test");
      const assetId = "broken-preview";
      assets.rows.set(
        assetId,
        record({
          id: assetId,
          userId: owner.user.id,
          status: "ready",
          derivatives: { thumb: derivativeObjectKey(owner.user.id, assetId, "thumb") },
        }),
      );
      const listed = await getJson(base, "/api/v1/assets", owner.cookie);
      assert.equal(listed.status, 502);
      assert.equal((listed.body as { error: string }).error, "presign_failed");
      assert.equal(JSON.stringify(listed.body).includes("supersecret"), false);
      const text = logs.lines.join("\n");
      assert.equal(text.includes("supersecret"), false);
      assert.equal(text.includes("X-Amz-Signature"), false);
    });
  } finally {
    logs.restore();
  }
});
