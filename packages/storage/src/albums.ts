import type { DerivativeSize } from "@memora/shared";
import pg from "pg";
import { mapAssetRow, type AssetRecord, type AssetRow } from "./assets.js";
import { safeErrorMessage } from "./redact.js";
import { ALBUM_SCHEMA_SQL, ASSET_SCHEMA_SQL, AUTH_SCHEMA_SQL, SCHEMA_ADVISORY_LOCK } from "./schema.js";

const { Pool } = pg;

export const MAX_ALBUMS_PER_USER = 100;
export const MAX_ASSETS_PER_ALBUM = 200;

export interface AlbumSummary {
  id: string;
  userId: string;
  title: string;
  themeId: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShareRecord {
  id: string;
  albumId: string;
  userId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** 只说明有没有设密码，绝不携带哈希。 */
  passwordProtected: boolean;
}

/**
 * 活跃分享的门闩。
 * passwordHash 只给校验用，调用方不得记录或回显。
 * themeId 只有模板 id，不含标题、照片或令牌。
 */
export interface ActiveShareGate {
  shareId: string;
  passwordHash: string | null;
  themeId: string;
}

/**
 * public：只读没有密码的分享。
 * granted：调用方已经对上密码；仍会拒绝撤销和过期。
 */
export type ShareReadAccess = "public" | "granted";

export interface PublicShareAsset {
  assetId: string;
  width: number | null;
  height: number | null;
  derivatives: Partial<Record<DerivativeSize, string>>;
  /**
   * 拍摄时间原文，还没做日期校验。
   * 公开响应不要原样带回这个字段。
   */
  capturedAt: string | null;
}

/**
 * 公开分享从 EXIF 里只取拍摄时间原文。
 * 坐标、格式、方向都不离开这一层。这里不做日期校验。
 */
export function shareCapturedAt(exif: unknown): string | null {
  if (!exif || typeof exif !== "object" || Array.isArray(exif)) return null;
  const raw = (exif as { capturedAt?: unknown }).capturedAt;
  return typeof raw === "string" ? raw : null;
}

/** 给公开读取用。不含文件名、原图键、完整 EXIF、令牌或令牌哈希。 */
export interface PublicShareView {
  shareId: string;
  albumId: string;
  userId: string;
  title: string;
  themeId: string;
  assets: PublicShareAsset[];
}

export type CreateAlbumResult =
  | { ok: true; album: AlbumSummary }
  | { ok: false; reason: "album_limit" | "user_not_found" | "asset_not_found" | "too_many" };

export type AddAssetsResult =
  | { ok: true; assetIds: string[] }
  | { ok: false; reason: "album_not_found" | "asset_not_found" | "too_many" };

export type CreateShareResult =
  | { ok: true; share: ShareRecord }
  | { ok: false; reason: "album_not_found" };

export interface NewAlbum {
  id: string;
  userId: string;
  title: string;
  themeId: string;
  /**
   * 一起放进这本相册的素材。空数组和省略一样，只建空册。
   * 重复 id 按第一次出现保留。超过 MAX_ASSETS_PER_ALBUM 直接 too_many，不建册。
   */
  assetIds?: readonly string[];
}

export interface NewShare {
  id: string;
  albumId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date | null;
  /** scrypt 编码。null 表示这个分享不设密码。不要传明文。 */
  passwordHash: string | null;
}

export interface AlbumRepository {
  ready(): Promise<void>;
  createAlbum(input: NewAlbum): Promise<CreateAlbumResult>;
  listAlbums(userId: string): Promise<AlbumSummary[]>;
  getOwnedAlbum(id: string, userId: string): Promise<AlbumSummary | null>;
  listOwnedAssets(albumId: string, userId: string): Promise<AssetRecord[] | null>;
  addAssets(albumId: string, userId: string, assetIds: string[]): Promise<AddAssetsResult>;
  createShare(input: NewShare): Promise<CreateShareResult>;
  listShares(albumId: string, userId: string): Promise<ShareRecord[] | null>;
  revokeShare(shareId: string, userId: string): Promise<ShareRecord | null>;
  /** 不含相册标题和素材。可带模板 id。撤销、过期、不存在都是 null。 */
  findActiveShareGate(tokenHash: string): Promise<ActiveShareGate | null>;
  /**
   * 读取仍有效的分享内容。
   * access 为 public 时，设了密码的分享返回 null，避免未经校验就拿出素材。
   */
  findActiveShareByTokenHash(
    tokenHash: string,
    access?: ShareReadAccess,
  ): Promise<PublicShareView | null>;
  close(): Promise<void>;
}

interface AlbumRow {
  id: string;
  user_id: string;
  title: string;
  theme_id: string;
  created_at: Date | string;
  updated_at: Date | string;
  asset_count?: number | string | null;
}

interface ShareRow {
  id: string;
  album_id: string;
  user_id: string;
  password_hash: string | null;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
}

interface PublicAssetRow {
  id: string;
  width: number | null;
  height: number | null;
  derivatives: Partial<Record<DerivativeSize, string>> | null;
  captured_at: string | null;
}

function mapPublicAsset(row: PublicAssetRow): PublicShareAsset {
  return {
    assetId: row.id,
    width: row.width,
    height: row.height,
    derivatives: row.derivatives ?? {},
    capturedAt: shareCapturedAt({ capturedAt: row.captured_at }),
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isoOrNull(value: Date | string | null): string | null {
  if (value === null) return null;
  return iso(value);
}

function mapAlbum(row: AlbumRow, assetCount?: number): AlbumSummary {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    themeId: row.theme_id,
    assetCount: assetCount ?? Number(row.asset_count ?? 0),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapShare(row: ShareRow): ShareRecord {
  return {
    id: row.id,
    albumId: row.album_id,
    userId: row.user_id,
    expiresAt: isoOrNull(row.expires_at),
    revokedAt: isoOrNull(row.revoked_at),
    createdAt: iso(row.created_at),
    passwordProtected: typeof row.password_hash === "string" && row.password_hash.length > 0,
  };
}

function uniqueAssetIds(ids: readonly string[] | undefined): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function postgresCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function sslFor(connectionString: string): pg.ConnectionConfig["ssl"] {
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return undefined;
  if (/sslmode=disable/i.test(connectionString)) return undefined;
  if (/sslmode=verify-full/i.test(connectionString)) {
    return { rejectUnauthorized: true };
  }
  if (/sslmode=(require|verify-ca|prefer)/i.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function createAlbumRepository(options: {
  connectionString: string;
  applicationName?: string;
}): AlbumRepository {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    application_name: options.applicationName ?? "memora",
    ssl: sslFor(options.connectionString),
  });
  pool.on("error", (err) => {
    console.error("[memora-storage] postgres pool error", safeErrorMessage(err));
  });

  let readyPromise: Promise<void> | null = null;

  async function migrate(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [SCHEMA_ADVISORY_LOCK]);
      await client.query(AUTH_SCHEMA_SQL);
      await client.query(ASSET_SCHEMA_SQL);
      await client.query(ALBUM_SCHEMA_SQL);
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [SCHEMA_ADVISORY_LOCK]);
      } catch (err) {
        console.error("[memora-storage] schema unlock failed", safeErrorMessage(err));
      }
      client.release();
    }
  }

  function ready(): Promise<void> {
    if (!readyPromise) {
      readyPromise = migrate().catch((err) => {
        readyPromise = null;
        throw err;
      });
    }
    return readyPromise;
  }

  async function query<T extends pg.QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<pg.QueryResult<T>> {
    await ready();
    return pool.query<T>(text, values);
  }

  async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    await ready();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      try {
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("[memora-storage] rollback failed", safeErrorMessage(rollbackErr));
        }
        throw err;
      }
    } finally {
      client.release();
    }
  }

  return {
    ready,

    async createAlbum(input) {
      const assetIds = uniqueAssetIds(input.assetIds);
      if (assetIds.length > MAX_ASSETS_PER_ALBUM) {
        return { ok: false, reason: "too_many" };
      }
      try {
        return await withTransaction(async (client) => {
          const user = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [
            input.userId,
          ]);
          if (user.rows.length === 0) return { ok: false, reason: "user_not_found" };
          const count = await client.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM albums WHERE user_id = $1`,
            [input.userId],
          );
          if (Number(count.rows[0]?.n ?? 0) >= MAX_ALBUMS_PER_USER) {
            return { ok: false, reason: "album_limit" };
          }
          if (assetIds.length > 0) {
            const found = await client.query<{ id: string }>(
              `SELECT id FROM assets
               WHERE user_id = $1 AND id = ANY($2::text[])
               FOR UPDATE`,
              [input.userId, assetIds],
            );
            if (found.rows.length !== assetIds.length) {
              return { ok: false, reason: "asset_not_found" };
            }
          }
          const inserted = await client.query<AlbumRow>(
            `INSERT INTO albums (id, user_id, title, theme_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id, user_id, title, theme_id, created_at, updated_at`,
            [input.id, input.userId, input.title, input.themeId],
          );
          const row = inserted.rows[0];
          if (!row) throw new Error("insert_album_failed");
          if (assetIds.length > 0) {
            await client.query(
              `INSERT INTO album_assets (album_id, asset_id, position)
               SELECT $1, id, ord::int
               FROM unnest($2::text[]) WITH ORDINALITY AS t(id, ord)`,
              [input.id, assetIds],
            );
          }
          return { ok: true, album: mapAlbum(row, assetIds.length) };
        });
      } catch (err) {
        if (postgresCode(err) === "23503") return { ok: false, reason: "asset_not_found" };
        throw err;
      }
    },

    async listAlbums(userId) {
      const result = await query<AlbumRow>(
        `SELECT a.id, a.user_id, a.title, a.theme_id, a.created_at, a.updated_at,
                (SELECT count(*)::int FROM album_assets aa WHERE aa.album_id = a.id) AS asset_count
         FROM albums a
         WHERE a.user_id = $1
         ORDER BY a.created_at DESC`,
        [userId],
      );
      return result.rows.map((row) => mapAlbum(row));
    },

    async getOwnedAlbum(id, userId) {
      const result = await query<AlbumRow>(
        `SELECT id, user_id, title, theme_id, created_at, updated_at,
                (SELECT count(*)::int FROM album_assets aa WHERE aa.album_id = albums.id) AS asset_count
         FROM albums
         WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      const row = result.rows[0];
      return row ? mapAlbum(row) : null;
    },

    async listOwnedAssets(albumId, userId) {
      const owned = await query<{ id: string }>(
        `SELECT id FROM albums WHERE id = $1 AND user_id = $2`,
        [albumId, userId],
      );
      if (owned.rows.length === 0) return null;
      const result = await query<AssetRow>(
        `SELECT ast.*
         FROM album_assets aa
         JOIN assets ast ON ast.id = aa.asset_id AND ast.user_id = $2
         WHERE aa.album_id = $1
         ORDER BY aa.position ASC, aa.created_at ASC`,
        [albumId, userId],
      );
      return result.rows.map((row) => mapAssetRow(row));
    },

    async addAssets(albumId, userId, assetIds) {
      return withTransaction(async (client) => {
        const album = await client.query(
          `SELECT id FROM albums WHERE id = $1 AND user_id = $2 FOR UPDATE`,
          [albumId, userId],
        );
        if (album.rows.length === 0) return { ok: false, reason: "album_not_found" };

        const uniqueIds = [...new Set(assetIds)];
        const found = await client.query<{ id: string }>(
          `SELECT id FROM assets WHERE user_id = $1 AND id = ANY($2::text[])`,
          [userId, uniqueIds],
        );
        if (found.rows.length !== uniqueIds.length) {
          return { ok: false, reason: "asset_not_found" };
        }

        const existing = await client.query<{ asset_id: string }>(
          `SELECT asset_id FROM album_assets WHERE album_id = $1 AND asset_id = ANY($2::text[])`,
          [albumId, uniqueIds],
        );
        const have = new Set(existing.rows.map((row) => row.asset_id));
        const fresh = uniqueIds.filter((id) => !have.has(id));
        const count = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM album_assets WHERE album_id = $1`,
          [albumId],
        );
        if (Number(count.rows[0]?.n ?? 0) + fresh.length > MAX_ASSETS_PER_ALBUM) {
          return { ok: false, reason: "too_many" };
        }

        const max = await client.query<{ max_pos: number }>(
          `SELECT COALESCE(MAX(position), 0)::int AS max_pos FROM album_assets WHERE album_id = $1`,
          [albumId],
        );
        let position = Number(max.rows[0]?.max_pos ?? 0);
        for (const assetId of fresh) {
          position += 1;
          await client.query(
            `INSERT INTO album_assets (album_id, asset_id, position)
             VALUES ($1, $2, $3)
             ON CONFLICT (album_id, asset_id) DO NOTHING`,
            [albumId, assetId, position],
          );
        }
        if (fresh.length > 0) {
          await client.query(`UPDATE albums SET updated_at = now() WHERE id = $1`, [albumId]);
        }
        const ordered = await client.query<{ asset_id: string }>(
          `SELECT asset_id FROM album_assets
           WHERE album_id = $1
           ORDER BY position ASC, created_at ASC`,
          [albumId],
        );
        return { ok: true, assetIds: ordered.rows.map((row) => row.asset_id) };
      });
    },

    async createShare(input) {
      const inserted = await query<ShareRow>(
        `INSERT INTO shares (id, album_id, user_id, token_hash, expires_at, password_hash)
         SELECT $1, a.id, a.user_id, $3, $4, $5
         FROM albums a
         WHERE a.id = $2 AND a.user_id = $6
         RETURNING id, album_id, user_id, password_hash, expires_at, revoked_at, created_at`,
        [
          input.id,
          input.albumId,
          input.tokenHash,
          input.expiresAt,
          input.passwordHash,
          input.userId,
        ],
      );
      const row = inserted.rows[0];
      if (!row) return { ok: false, reason: "album_not_found" };
      return { ok: true, share: mapShare(row) };
    },

    async listShares(albumId, userId) {
      const owned = await query<{ id: string }>(
        `SELECT id FROM albums WHERE id = $1 AND user_id = $2`,
        [albumId, userId],
      );
      if (owned.rows.length === 0) return null;
      const result = await query<ShareRow>(
        `SELECT id, album_id, user_id, password_hash, expires_at, revoked_at, created_at
         FROM shares
         WHERE album_id = $1 AND user_id = $2
         ORDER BY created_at DESC`,
        [albumId, userId],
      );
      return result.rows.map((row) => mapShare(row));
    },

    async revokeShare(shareId, userId) {
      const result = await query<ShareRow>(
        `UPDATE shares
         SET revoked_at = COALESCE(revoked_at, now())
         WHERE id = $1 AND user_id = $2
         RETURNING id, album_id, user_id, password_hash, expires_at, revoked_at, created_at`,
        [shareId, userId],
      );
      const row = result.rows[0];
      return row ? mapShare(row) : null;
    },

    async findActiveShareGate(tokenHash) {
      const result = await query<{ id: string; password_hash: string | null; theme_id: string }>(
        `SELECT s.id, s.password_hash, a.theme_id
         FROM shares s
         JOIN albums a ON a.id = s.album_id AND a.user_id = s.user_id
         WHERE s.token_hash = $1
           AND s.revoked_at IS NULL
           AND (s.expires_at IS NULL OR s.expires_at > now())`,
        [tokenHash],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        shareId: row.id,
        passwordHash: typeof row.password_hash === "string" && row.password_hash.length > 0
          ? row.password_hash
          : null,
        themeId: row.theme_id,
      };
    },

    async findActiveShareByTokenHash(tokenHash, access = "public") {
      return withTransaction(async (client) => {
        const share = await client.query<{
          id: string;
          album_id: string;
          user_id: string;
          title: string;
          theme_id: string;
        }>(
          `SELECT s.id, s.album_id, a.user_id, a.title, a.theme_id
           FROM shares s
           JOIN albums a ON a.id = s.album_id AND a.user_id = s.user_id
           WHERE s.token_hash = $1
             AND s.revoked_at IS NULL
             AND (s.expires_at IS NULL OR s.expires_at > now())
             AND ($2::boolean OR s.password_hash IS NULL)`,
          [tokenHash, access === "granted"],
        );
        const row = share.rows[0];
        if (!row) return null;
        const assets = await client.query<PublicAssetRow>(
          `SELECT ast.id, ast.width, ast.height, ast.derivatives,
                  ast.exif->>'capturedAt' AS captured_at
           FROM album_assets aa
           JOIN assets ast ON ast.id = aa.asset_id AND ast.user_id = $2
           WHERE aa.album_id = $1
           ORDER BY aa.position ASC, aa.created_at ASC`,
          [row.album_id, row.user_id],
        );
        const stillActive = await client.query(
          `SELECT id FROM shares
           WHERE id = $1
             AND revoked_at IS NULL
             AND (expires_at IS NULL OR expires_at > now())
             AND ($2::boolean OR password_hash IS NULL)`,
          [row.id, access === "granted"],
        );
        if (stillActive.rows.length === 0) return null;
        return {
          shareId: row.id,
          albumId: row.album_id,
          userId: row.user_id,
          title: row.title,
          themeId: row.theme_id,
          assets: assets.rows.map((asset) => mapPublicAsset(asset)),
        };
      });
    },

    async close() {
      await pool.end();
    },
  };
}
