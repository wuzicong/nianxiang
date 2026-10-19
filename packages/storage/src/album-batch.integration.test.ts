import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { originalObjectKey } from "@memora/shared";
import pg from "pg";
import { createAlbumRepository, MAX_ASSETS_PER_ALBUM } from "./albums.js";
import { createAssetRepository } from "./assets.js";
import { createAuthRepository } from "./auth.js";

const databaseUrl = process.env.MEMORA_AUTH_DATABASE_URL;

test("postgres createAlbum and presign album target commit or roll back together", async (t) => {
  if (!databaseUrl) {
    t.skip("set MEMORA_AUTH_DATABASE_URL to exercise album batch writes");
    return;
  }
  const albums = createAlbumRepository({
    connectionString: databaseUrl,
    applicationName: "memora-album-batch-test",
  });
  const assets = createAssetRepository({
    connectionString: databaseUrl,
    applicationName: "memora-album-batch-test",
  });
  const auth = createAuthRepository({
    connectionString: databaseUrl,
    applicationName: "memora-album-batch-test",
  });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const readyId = randomUUID();
  const queuedId = randomUUID();
  const foreignId = randomUUID();
  try {
    await auth.insertUser({
      id: ownerId,
      email: `batch-${ownerId}@memora.test`,
      passwordHash: "scrypt$integration$not-a-password",
    });
    await auth.insertUser({
      id: otherId,
      email: `batch-${otherId}@memora.test`,
      passwordHash: "scrypt$integration$not-a-password",
    });
    await assets.insertPending({
      id: readyId,
      userId: ownerId,
      storageKey: originalObjectKey(ownerId, readyId),
      filename: "harbor.jpg",
      contentType: "image/jpeg",
      sizeBytes: 8,
    });
    await assets.markReady(readyId, {}, { width: 2, height: 2 });
    await assets.insertPending({
      id: queuedId,
      userId: ownerId,
      storageKey: originalObjectKey(ownerId, queuedId),
      filename: "queue.jpg",
      contentType: "image/jpeg",
      sizeBytes: 8,
    });
    await assets.insertPending({
      id: foreignId,
      userId: otherId,
      storageKey: originalObjectKey(otherId, foreignId),
      filename: "secret.jpg",
      contentType: "image/jpeg",
      sizeBytes: 8,
    });

    const rejected = await albums.createAlbum({
      id: randomUUID(),
      userId: ownerId,
      title: "不该留下",
      themeId: "cotton-candy",
      assetIds: [readyId, foreignId],
    });
    assert.deepEqual(rejected, { ok: false, reason: "asset_not_found" });
    const leftover = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM albums WHERE user_id = $1 AND title = '不该留下'`,
      [ownerId],
    );
    assert.equal(leftover.rows[0]?.n, 0);

    const created = await albums.createAlbum({
      id: randomUUID(),
      userId: ownerId,
      title: "一次放进",
      themeId: "kyoto-lantern",
      assetIds: [queuedId, readyId, queuedId],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.album.assetCount, 2);
    const ordered = await albums.listOwnedAssets(created.album.id, ownerId);
    assert.deepEqual(
      ordered?.map((asset) => asset.id),
      [queuedId, readyId],
    );

    const pendingId = randomUUID();
    const reserved = await assets.reservePendingUpload(
      {
        id: pendingId,
        userId: ownerId,
        storageKey: originalObjectKey(ownerId, pendingId),
        filename: "new.jpg",
        contentType: "image/jpeg",
        sizeBytes: 8,
      },
      10,
      { albumId: created.album.id, maxAssets: MAX_ASSETS_PER_ALBUM },
    );
    assert.equal(reserved, "ok");
    const linked = await albums.listOwnedAssets(created.album.id, ownerId);
    assert.deepEqual(
      linked?.map((asset) => asset.id),
      [queuedId, readyId, pendingId],
    );

    const missingAlbum = await assets.reservePendingUpload(
      {
        id: randomUUID(),
        userId: ownerId,
        storageKey: originalObjectKey(ownerId, "no-album"),
        filename: "nope.jpg",
        contentType: "image/jpeg",
        sizeBytes: 8,
      },
      10,
      { albumId: randomUUID(), maxAssets: MAX_ASSETS_PER_ALBUM },
    );
    assert.equal(missingAlbum, "album_not_found");
    const stray = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM assets WHERE filename = 'nope.jpg'`,
      [],
    );
    assert.equal(stray.rows[0]?.n, 0);
  } finally {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[ownerId, otherId]]);
    await pool.query(`DELETE FROM assets WHERE user_id = ANY($1::text[])`, [[ownerId, otherId]]);
    await pool.end();
    await albums.close();
    await assets.close();
    await auth.close();
  }
});
