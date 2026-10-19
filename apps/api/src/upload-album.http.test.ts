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

const uploadBody = {
  filename: "trip.jpg",
  mime: "image/jpeg",
  size: 100,
};

test("upload-url links an owned album in the presign and leaves library uploads unattached", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const { app } = createTestApp({ assets, albums, objects: fakeObjects() });
  await withServer(app, async (base) => {
    const owner = await registerSession(base, "presign-owner@memora.test");
    const other = await registerSession(base, "presign-other@memora.test");
    const ownAlbum = await postJson(base, "/api/v1/albums", { title: "海港" }, owner.cookie);
    const otherAlbum = await postJson(base, "/api/v1/albums", { title: "别人" }, other.cookie);
    const albumId = (ownAlbum.body as { album: { albumId: string } }).album.albumId;
    const foreignAlbumId = (otherAlbum.body as { album: { albumId: string } }).album.albumId;

    const linked = await postJson(
      base,
      "/api/v1/assets/upload-url",
      { ...uploadBody, albumId },
      owner.cookie,
    );
    assert.equal(linked.status, 201);
    const linkedBody = linked.body as { assetId: string; albumId?: string; key: string };
    assert.equal(linkedBody.albumId, albumId);
    assert.equal(assets.rows.get(linkedBody.assetId)?.status, "pending_upload");
    const detail = await getJson(base, `/api/v1/albums/${albumId}`, owner.cookie);
    assert.deepEqual(
      (detail.body as { assets: { assetId: string }[] }).assets.map((item) => item.assetId),
      [linkedBody.assetId],
    );

    const loose = await postJson(base, "/api/v1/assets/upload-url", uploadBody, owner.cookie);
    assert.equal(loose.status, 201);
    assert.equal("albumId" in (loose.body as object), false);
    const afterLoose = await getJson(base, `/api/v1/albums/${albumId}`, owner.cookie);
    assert.equal((afterLoose.body as { assets: unknown[] }).assets.length, 1);

    const stolen = await postJson(
      base,
      "/api/v1/assets/upload-url",
      { ...uploadBody, albumId: foreignAlbumId },
      owner.cookie,
    );
    const missing = await postJson(
      base,
      "/api/v1/assets/upload-url",
      { ...uploadBody, albumId: randomUUID() },
      owner.cookie,
    );
    assert.equal(stolen.status, 404);
    assert.equal(missing.status, 404);
    assert.deepEqual(stolen.body, missing.body);
    assert.equal((stolen.body as { error: string }).error, "album_not_found");
    assert.equal(
      [...assets.rows.values()].filter((row) => row.status === "pending_upload").length,
      2,
    );

    const bad = await postJson(
      base,
      "/api/v1/assets/upload-url",
      { ...uploadBody, albumId: "../secret" },
      owner.cookie,
    );
    assert.equal(bad.status, 400);
    assert.equal(JSON.stringify(bad.body).includes(linkedBody.key), false);
  });
});

test("a failed presign drops the pending asset and its album link", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const { app } = createTestApp({
    assets,
    albums,
    objects: fakeObjects({ presignError: new Error("storage down") }),
  });
  await withServer(app, async (base) => {
    const owner = await registerSession(base, "presign-fail@memora.test");
    const created = await postJson(base, "/api/v1/albums", { title: "海港" }, owner.cookie);
    const albumId = (created.body as { album: { albumId: string } }).album.albumId;
    const failed = await postJson(
      base,
      "/api/v1/assets/upload-url",
      { ...uploadBody, albumId },
      owner.cookie,
    );
    assert.equal(failed.status, 502);
    assert.equal(assets.rows.size, 0);
    const detail = await getJson(base, `/api/v1/albums/${albumId}`, owner.cookie);
    assert.deepEqual((detail.body as { assets: unknown[] }).assets, []);
  });
});

test("upload-url refuses a full album without consuming a pending slot", async () => {
  const assets = memoryAssets();
  const albums = memoryAlbums(assets);
  const { app } = createTestApp({ assets, albums, objects: fakeObjects() });
  await withServer(app, async (base) => {
    const owner = await registerSession(base, "presign-full@memora.test");
    const created = await postJson(base, "/api/v1/albums", { title: "满了" }, owner.cookie);
    const albumId = (created.body as { album: { albumId: string } }).album.albumId;
    const ids: string[] = [];
    for (let index = 0; index < MAX_ASSETS_PER_ALBUM; index += 1) {
      const id = `full${index}`;
      ids.push(id);
      assets.rows.set(
        id,
        record({ id, userId: owner.user.id, status: "ready", filename: `${id}.jpg` }),
      );
    }
    const filled = await albums.addAssets(albumId, owner.user.id, ids);
    assert.equal(filled.ok, true);

    const rejected = await postJson(
      base,
      "/api/v1/assets/upload-url",
      { ...uploadBody, albumId },
      owner.cookie,
    );
    assert.equal(rejected.status, 409);
    assert.equal((rejected.body as { error: string }).error, "album_full");
    assert.equal(
      [...assets.rows.values()].some((row) => row.status === "pending_upload"),
      false,
    );
    const detail = await getJson(base, `/api/v1/albums/${albumId}`, owner.cookie);
    assert.equal((detail.body as { album: { assetCount: number } }).album.assetCount, MAX_ASSETS_PER_ALBUM);
  });
});
