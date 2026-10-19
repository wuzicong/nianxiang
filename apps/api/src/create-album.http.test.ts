import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { MAX_ASSETS_PER_ALBUM } from "@memora/storage";
import {
  createTestApp,
  fakeObjects,
  getJson,
  memoryAlbums,
  memoryAssets,
  postJson,
  record,
  registerSession,
  withServer,
} from "./test-app.js";

test("createAlbum attaches owned assets in one request and rolls back when any id is missing", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const { app } = createTestApp({ assets, albums, objects: fakeObjects() });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "batch-owner@memora.test");
      const other = await registerSession(base, "batch-other@memora.test");
      const first = record({
        id: randomUUID(),
        userId: owner.user.id,
        status: "ready",
        filename: "harbor.jpg",
      });
      const second = record({
        id: randomUUID(),
        userId: owner.user.id,
        status: "processing",
        filename: "queue.jpg",
      });
      const foreign = record({
        id: randomUUID(),
        userId: other.user.id,
        status: "ready",
        filename: "secret-35.12345.jpg",
      });
      assets.rows.set(first.id, first);
      assets.rows.set(second.id, second);
      assets.rows.set(foreign.id, foreign);

      const created = await postJson(
        base,
        "/api/v1/albums",
        {
          title: "海港",
          themeId: "magazine-heirloom",
          assetIds: [second.id, first.id, second.id],
        },
        owner.cookie,
      );
      assert.equal(created.status, 201);
      const album = (
        created.body as { album: { albumId: string; themeId: string; assetCount: number; userId: string } }
      ).album;
      assert.equal(album.themeId, "magazine-heirloom");
      assert.equal(album.assetCount, 2);
      assert.equal(album.userId, owner.user.id);
      const detail = await getJson(base, `/api/v1/albums/${album.albumId}`, owner.cookie);
      assert.equal(detail.status, 200);
      assert.deepEqual(
        (detail.body as { assets: { assetId: string }[] }).assets.map((item) => item.assetId),
        [second.id, first.id],
      );

      const empty = await postJson(base, "/api/v1/albums", { title: "空册" }, owner.cookie);
      assert.equal(empty.status, 201);
      assert.equal((empty.body as { album: { assetCount: number } }).album.assetCount, 0);

      const before = await getJson(base, "/api/v1/albums", owner.cookie);
      const beforeCount = (before.body as { albums: unknown[] }).albums.length;

      const tooMany = await postJson(
        base,
        "/api/v1/albums",
        { title: "太多", assetIds: Array.from({ length: MAX_ASSETS_PER_ALBUM + 1 }, () => first.id) },
        owner.cookie,
      );
      assert.equal(tooMany.status, 400);
      assert.equal((tooMany.body as { error: string }).error, "invalid_request");

      const missingId = randomUUID();
      const missing = await postJson(
        base,
        "/api/v1/albums",
        { title: "缺一张", assetIds: [first.id, missingId] },
        owner.cookie,
      );
      const stolen = await postJson(
        base,
        "/api/v1/albums",
        { title: "别人的", assetIds: [first.id, foreign.id] },
        owner.cookie,
      );
      assert.equal(missing.status, 404);
      assert.equal(stolen.status, 404);
      assert.equal((missing.body as { error: string }).error, "asset_not_found");
      assert.deepEqual(missing.body, stolen.body);
      assert.equal(JSON.stringify(stolen.body).includes("35.12345"), false);
      assert.equal(JSON.stringify(stolen.body).includes(foreign.filename), false);

      const after = await getJson(base, "/api/v1/albums", owner.cookie);
      assert.equal((after.body as { albums: unknown[] }).albums.length, beforeCount);
      assert.equal(logs.some((line) => line.includes(foreign.storageKey)), false);
      assert.equal(logs.some((line) => line.includes("35.12345")), false);
      assert.equal(logs.some((line) => line.includes(foreign.filename)), false);
    });
  } finally {
    console.log = original;
  }
});
