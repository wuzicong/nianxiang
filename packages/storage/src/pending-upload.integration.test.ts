import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { createAlbumRepository } from "./albums.js";
import { createAssetRepository } from "./assets.js";
import { createAuthRepository } from "./auth.js";
import { cleanupStalePendingUploads } from "./pending-upload.js";

const databaseUrl = process.env.MEMORA_AUTH_DATABASE_URL;

test("postgres sweep deletes only stale pending uploads and caps each user", async (t) => {
  if (!databaseUrl) {
    t.skip("set MEMORA_AUTH_DATABASE_URL to exercise pending upload cleanup");
    return;
  }
  const connectionString = databaseUrl.includes("?")
    ? `${databaseUrl}&options=-c%20lock_timeout%3D3s`
    : `${databaseUrl}?options=-c%20lock_timeout%3D3s`;
  const assets = createAssetRepository({
    connectionString,
    applicationName: "memora-pending-test",
  });
  const auth = createAuthRepository({
    connectionString,
    applicationName: "memora-pending-test",
  });
  const albums = createAlbumRepository({
    connectionString,
    applicationName: "memora-pending-test",
  });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const userId = randomUUID();
  const otherId = randomUUID();
  const raceId = randomUUID();
  const staleId = randomUUID();
  const freshId = randomUUID();
  const uploadedId = randomUUID();
  const readyId = randomUUID();
  const missingId = randomUUID();
  const lockedId = randomUUID();
  const boundaryId = randomUUID();
  const albumId = randomUUID();
  const userIds = [userId, otherId, raceId];
  const deleted: string[] = [];
  const locker = await pool.connect();
  try {
    for (const id of userIds) {
      await auth.insertUser({
        id,
        email: `pending-${id}@memora.test`,
        passwordHash: "scrypt$integration$not-a-password",
      });
    }

    async function reserve(owner: string, assetId: string, maxPending: number) {
      return assets.reservePendingUpload(
        {
          id: assetId,
          userId: owner,
          storageKey: `users/${owner}/originals/${assetId}`,
          filename: "harbor.jpg",
          contentType: "image/jpeg",
          sizeBytes: 12,
        },
        maxPending,
      );
    }

    for (const assetId of [staleId, freshId, uploadedId, readyId, missingId, lockedId, boundaryId]) {
      assert.equal(await reserve(userId, assetId, 50), "ok");
    }
    const derivativeKey = `users/${userId}/derivatives/${staleId}/thumb.webp`;
    await pool.query(
      `UPDATE assets
       SET created_at = now() - interval '2 hours',
           derivatives = $2::jsonb
       WHERE id = $1`,
      [staleId, JSON.stringify({ thumb: derivativeKey })],
    );
    await pool.query(
      `UPDATE assets SET created_at = now() - interval '2 hours', status = 'uploaded' WHERE id = $1`,
      [uploadedId],
    );
    await pool.query(
      `UPDATE assets SET created_at = now() - interval '2 hours', status = 'ready' WHERE id = $1`,
      [readyId],
    );
    await pool.query(`UPDATE assets SET created_at = now() - interval '2 hours' WHERE id = ANY($1::text[])`, [
      [missingId, lockedId],
    ]);
    await pool.query(`UPDATE assets SET created_at = now() - interval '59 minutes' WHERE id = $1`, [
      boundaryId,
    ]);

    const created = await albums.createAlbum({
      id: albumId,
      userId,
      title: "港口",
      themeId: "cotton-candy",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const added = await albums.addAssets(albumId, userId, [staleId, freshId]);
    assert.equal(added.ok, true);

    assert.equal(await reserve(otherId, randomUUID(), 1), "ok");
    assert.equal(await reserve(otherId, randomUUID(), 1), "limit");

    await locker.query("BEGIN");
    await locker.query(`SELECT id FROM assets WHERE id = $1 FOR UPDATE`, [lockedId]);
    const logs: string[] = [];
    const counts = await cleanupStalePendingUploads({
      cleaner: assets,
      ttlMinutes: 60,
      limit: 20,
      log: (line) => logs.push(line),
      deleteObject: async (key) => {
        deleted.push(key);
        if (key.includes(missingId)) {
          throw Object.assign(new Error("missing object"), { name: "NoSuchKey" });
        }
      },
    });
    const lockedStill = await pool.query<{ status: string }>(`SELECT status FROM assets WHERE id = $1`, [
      lockedId,
    ]);
    assert.equal(lockedStill.rows[0]?.status, "pending_upload");
    await locker.query("ROLLBACK");

    assert.deepEqual(counts, { deleted: 2, skipped: 0, failed: 0 });
    assert.equal(deleted.includes(`users/${userId}/originals/${staleId}`), true);
    assert.equal(deleted.includes(derivativeKey), true);
    assert.equal(deleted.includes(`users/${userId}/originals/${missingId}`), true);
    for (const kept of [uploadedId, readyId, freshId, boundaryId, lockedId]) {
      assert.equal(deleted.some((key) => key.includes(kept)), false);
    }
    const joined = logs.join("\n");
    assert.equal(joined.includes("X-Amz"), false);
    assert.equal(joined.includes(derivativeKey), false);
    assert.match(joined, new RegExp(`asset=${staleId}`));
    assert.match(joined, new RegExp(`asset=${missingId}`));

    async function statusOf(id: string): Promise<string | null> {
      const result = await pool.query<{ status: string }>(`SELECT status FROM assets WHERE id = $1`, [id]);
      return result.rows[0]?.status ?? null;
    }
    assert.equal(await statusOf(staleId), null);
    assert.equal(await statusOf(missingId), null);
    assert.equal(await statusOf(freshId), "pending_upload");
    assert.equal(await statusOf(uploadedId), "uploaded");
    assert.equal(await statusOf(readyId), "ready");
    assert.equal(await statusOf(boundaryId), "pending_upload");
    const membership = await pool.query<{ asset_id: string }>(
      `SELECT asset_id FROM album_assets WHERE album_id = $1`,
      [albumId],
    );
    assert.deepEqual(
      membership.rows.map((row) => row.asset_id),
      [freshId],
    );

    const second = await cleanupStalePendingUploads({
      cleaner: assets,
      ttlMinutes: 60,
      limit: 20,
      deleteObject: async (key) => {
        deleted.push(key);
      },
    });
    assert.deepEqual(second, { deleted: 1, skipped: 0, failed: 0 });
    assert.equal(await statusOf(lockedId), null);
    assert.equal(deleted.includes(`users/${userId}/originals/${lockedId}`), true);
    assert.equal(await statusOf(freshId), "pending_upload");
    assert.equal(await statusOf(boundaryId), "pending_upload");

    const boomId = randomUUID();
    assert.equal(await reserve(userId, boomId, 50), "ok");
    await pool.query(`UPDATE assets SET created_at = now() - interval '2 hours' WHERE id = $1`, [boomId]);
    const failed = await cleanupStalePendingUploads({
      cleaner: assets,
      ttlMinutes: 60,
      limit: 5,
      deleteObject: async () => {
        throw new Error("storage unavailable");
      },
    });
    assert.equal(failed.failed, 1);
    assert.equal(failed.deleted, 0);
    assert.equal(await statusOf(boomId), "pending_upload");
    assert.equal(await statusOf(freshId), "pending_upload");
    const recovered = await cleanupStalePendingUploads({
      cleaner: assets,
      ttlMinutes: 60,
      limit: 5,
      deleteObject: async (key) => {
        deleted.push(key);
      },
    });
    assert.equal(recovered.deleted, 1);
    assert.equal(await statusOf(boomId), null);
    assert.equal(deleted.includes(`users/${userId}/originals/${boomId}`), true);

    const racedA = randomUUID();
    const racedB = randomUUID();
    const [firstReserve, secondReserve] = await Promise.all([
      reserve(raceId, racedA, 1),
      reserve(raceId, racedB, 1),
    ]);
    assert.deepEqual([firstReserve, secondReserve].sort(), ["limit", "ok"]);
    const pendingCount = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM assets WHERE user_id = $1 AND status = 'pending_upload'`,
      [raceId],
    );
    assert.equal(Number(pendingCount.rows[0]?.n), 1);
  } finally {
    try {
      await locker.query("ROLLBACK");
    } catch {
      // 事务可能已经结束。
    }
    locker.release();
    await pool.query(`DELETE FROM assets WHERE user_id = ANY($1::text[])`, [userIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [userIds]);
    await pool.end();
    await assets.close();
    await auth.close();
    await albums.close();
  }
});
