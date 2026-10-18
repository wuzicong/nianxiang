import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { derivativeObjectKey, originalObjectKey } from "@memora/shared";
import pg from "pg";
import { createAlbumRepository } from "./albums.js";
import { createAssetRepository } from "./assets.js";
import { createAuthRepository } from "./auth.js";

const databaseUrl = process.env.MEMORA_AUTH_DATABASE_URL;

test("postgres albums and shares revoke, expire, and keep only the token hash", async (t) => {
  if (!databaseUrl) {
    t.skip("set MEMORA_AUTH_DATABASE_URL to exercise album and share tables");
    return;
  }
  const albums = createAlbumRepository({
    connectionString: databaseUrl,
    applicationName: "memora-album-test",
  });
  const auth = createAuthRepository({
    connectionString: databaseUrl,
    applicationName: "memora-album-test",
  });
  const assets = createAssetRepository({
    connectionString: databaseUrl,
    applicationName: "memora-album-test",
  });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const assetId = randomUUID();
  const foreignAssetId = randomUUID();
  try {
    await auth.insertUser({
      id: ownerId,
      email: `album-${ownerId}@memora.test`,
      passwordHash: "scrypt$integration$not-a-password",
    });
    await auth.insertUser({
      id: otherId,
      email: `album-${otherId}@memora.test`,
      passwordHash: "scrypt$integration$not-a-password",
    });
    await assets.insertPending({
      id: assetId,
      userId: ownerId,
      storageKey: originalObjectKey(ownerId, assetId),
      filename: "harbor.jpg",
      contentType: "image/jpeg",
      sizeBytes: 12,
    });
    await assets.insertPending({
      id: foreignAssetId,
      userId: otherId,
      storageKey: originalObjectKey(otherId, foreignAssetId),
      filename: "secret.jpg",
      contentType: "image/jpeg",
      sizeBytes: 12,
    });
    const preview = derivativeObjectKey(ownerId, assetId, "preview");
    await assets.markReady(assetId, { preview }, { width: 8, height: 8 });

    const created = await albums.createAlbum({
      id: randomUUID(),
      userId: ownerId,
      title: "海港",
      themeId: "kyoto-lantern",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const rejected = await albums.addAssets(created.album.id, ownerId, [assetId, foreignAssetId]);
    assert.deepEqual(rejected, { ok: false, reason: "asset_not_found" });
    const added = await albums.addAssets(created.album.id, ownerId, [assetId]);
    assert.deepEqual(added, { ok: true, assetIds: [assetId] });

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const share = await albums.createShare({
      id: randomUUID(),
      albumId: created.album.id,
      userId: ownerId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    assert.equal(share.ok, true);
    if (!share.ok) return;
    const stored = await pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM shares WHERE id = $1`,
      [share.share.id],
    );
    assert.equal(stored.rows[0]?.token_hash, tokenHash);
    assert.notEqual(stored.rows[0]?.token_hash, token);
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'shares'`,
    );
    assert.equal(
      columns.rows.some((row) => row.column_name === "token"),
      false,
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO shares (id, album_id, user_id, token_hash)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), created.album.id, ownerId, token],
        ),
      (err: unknown) => (err as { code?: string }).code === "23514",
    );

    const active = await albums.findActiveShareByTokenHash(tokenHash);
    assert.equal(active?.title, "海港");
    assert.equal(JSON.stringify(active).includes("/originals/"), false);
    assert.equal(active?.assets[0]?.derivatives.preview, preview);

    const expired = await albums.createShare({
      id: randomUUID(),
      albumId: created.album.id,
      userId: ownerId,
      tokenHash: createHash("sha256").update("expired-share-token").digest("hex"),
      expiresAt: new Date(Date.now() - 60_000),
    });
    assert.equal(expired.ok, true);
    if (!expired.ok) return;
    assert.equal(
      await albums.findActiveShareByTokenHash(
        createHash("sha256").update("expired-share-token").digest("hex"),
      ),
      null,
    );

    const revoked = await albums.revokeShare(share.share.id, ownerId);
    assert.ok(revoked?.revokedAt);
    assert.equal(await albums.findActiveShareByTokenHash(tokenHash), null);
    const stranger = await albums.revokeShare(share.share.id, otherId);
    assert.equal(stranger, null);
  } finally {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[ownerId, otherId]]);
    await pool.query(`DELETE FROM assets WHERE id = ANY($1::text[])`, [[assetId, foreignAssetId]]);
    await pool.end();
    await albums.close();
    await auth.close();
    await assets.close();
  }
});
