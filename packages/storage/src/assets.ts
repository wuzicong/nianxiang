import pg from "pg";
import type { DerivativeSize } from "@memora/shared";
import {
  CLAIM_STALE_PENDING_UPLOAD_SQL,
  DELETE_ALBUM_ASSET_LINKS_SQL,
  DELETE_STALE_PENDING_UPLOAD_SQL,
  pendingUploadObjectKeys,
  type PendingUploadCleaner,
  type StalePendingClaim,
} from "./pending-upload.js";
import { safeErrorMessage } from "./redact.js";
import { ASSET_SCHEMA_SQL, SCHEMA_ADVISORY_LOCK } from "./schema.js";

/** 与建表用的会话锁错开。同一用户的未完成上传名额串行申请。 */
const PENDING_UPLOAD_ADVISORY_SEED = "9021081551";

const { Pool } = pg;

export type AssetStatus =
  | "pending_upload"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";

export interface ExifSummary {
  width?: number;
  height?: number;
  format?: string;
  orientation?: number;
  capturedAt?: string;
  hasGps: boolean;
  lat?: number;
  lng?: number;
  error?: string;
}

export interface NewAsset {
  id: string;
  userId: string;
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface AssetRecord {
  id: string;
  userId: string;
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: AssetStatus;
  width: number | null;
  height: number | null;
  derivatives: Partial<Record<DerivativeSize, string>>;
  exif: ExifSummary | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRepository {
  ready(): Promise<void>;
  insertPending(asset: NewAsset): Promise<void>;
  /**
   * 同一用户的 pending_upload 达到 maxPending 时不插入。
   * 计数和插入在同一个事务里，并用咨询锁挡住并发申请。
   */
  reservePendingUpload(asset: NewAsset, maxPending: number): Promise<"ok" | "limit">;
  deletePending(id: string): Promise<void>;
  get(id: string): Promise<AssetRecord | null>;
  markUploaded(id: string): Promise<AssetRecord | null>;
  markProcessing(id: string): Promise<void>;
  markReady(
    id: string,
    derivatives: Partial<Record<DerivativeSize, string>>,
    dimensions: { width?: number; height?: number },
  ): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  saveExif(id: string, exif: ExifSummary): Promise<void>;
  noteExifFailure(id: string, error: string): Promise<void>;
  /** 只返回该用户的素材，按上传时间新到旧。limit 在仓库内夹到 1–500。 */
  listByUser(userId: string, limit: number): Promise<AssetRecord[]>;
  close(): Promise<void>;
}

export interface AssetRow {
  id: string;
  user_id: string;
  storage_key: string;
  filename: string;
  content_type: string;
  size_bytes: string | number;
  status: AssetStatus;
  width: number | null;
  height: number | null;
  derivatives: Partial<Record<DerivativeSize, string>> | null;
  exif: ExifSummary | null;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function clampLibraryLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(500, Math.max(1, Math.trunc(limit)));
}

export function mapAssetRow(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    userId: row.user_id,
    storageKey: row.storage_key,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    width: row.width,
    height: row.height,
    derivatives: row.derivatives ?? {},
    exif: row.exif,
    error: row.error,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
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

export function createAssetRepository(options: {
  connectionString: string;
  applicationName?: string;
}): AssetRepository & PendingUploadCleaner {
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
      await client.query(ASSET_SCHEMA_SQL);
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

  async function query<T extends pg.QueryResultRow = AssetRow>(
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

  async function insertPendingRow(
    queryable: { query: (text: string, values?: unknown[]) => Promise<pg.QueryResult> },
    asset: NewAsset,
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO assets (
         id, user_id, storage_key, filename, content_type, size_bytes, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending_upload')`,
      [
        asset.id,
        asset.userId,
        asset.storageKey,
        asset.filename,
        asset.contentType,
        asset.sizeBytes,
      ],
    );
  }

  function openClaim(client: pg.PoolClient, row: AssetRow): StalePendingClaim {
    let closed = false;
    const objectKeys = pendingUploadObjectKeys(row.storage_key, row.derivatives);
    async function finish(action: "COMMIT" | "ROLLBACK"): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        await client.query(action);
      } catch (err) {
        if (action === "COMMIT") {
          try {
            await client.query("ROLLBACK");
          } catch {
            // 提交失败后再回滚一次，避免连接带着打开的事务回到池里。
          }
        }
        throw err;
      } finally {
        client.release();
      }
    }
    return {
      id: row.id,
      objectKeys,
      async stillPending() {
        if (closed) return false;
        const current = await client.query<{ status: AssetStatus }>(
          `SELECT status FROM assets WHERE id = $1`,
          [row.id],
        );
        return current.rows[0]?.status === "pending_upload";
      },
      async stageDelete() {
        if (closed) return false;
        const present = await client.query<{ present: boolean }>(
          `SELECT to_regclass('public.album_assets') IS NOT NULL AS present`,
        );
        if (present.rows[0]?.present) {
          await client.query(DELETE_ALBUM_ASSET_LINKS_SQL, [row.id]);
        }
        const deleted = await client.query(DELETE_STALE_PENDING_UPLOAD_SQL, [row.id]);
        return (deleted.rowCount ?? 0) > 0;
      },
      commit: () => finish("COMMIT"),
      abort: () => finish("ROLLBACK"),
    };
  }

  return {
    ready,
    async insertPending(asset) {
      await ready();
      await insertPendingRow(pool, asset);
    },
    async reservePendingUpload(asset, maxPending) {
      if (!Number.isInteger(maxPending) || maxPending < 1) return "limit";
      return withTransaction(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, $2::bigint))`, [
          asset.userId,
          PENDING_UPLOAD_ADVISORY_SEED,
        ]);
        const count = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n
           FROM assets
           WHERE user_id = $1 AND status = 'pending_upload'`,
          [asset.userId],
        );
        if (Number(count.rows[0]?.n ?? 0) >= maxPending) return "limit";
        await insertPendingRow(client, asset);
        return "ok";
      });
    },
    async claimStalePendingUpload(ttlMinutes) {
      if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1) return null;
      await ready();
      const client = await pool.connect();
      let began = false;
      try {
        await client.query("BEGIN");
        began = true;
        const selected = await client.query<AssetRow>(CLAIM_STALE_PENDING_UPLOAD_SQL, [
          ttlMinutes,
        ]);
        const row = selected.rows[0];
        if (!row) {
          await client.query("COMMIT");
          client.release();
          return null;
        }
        return openClaim(client, row);
      } catch (err) {
        if (began) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // 回滚失败时仍然释放连接。
          }
        }
        client.release();
        throw err;
      }
    },
    async deletePending(id) {
      await query(`DELETE FROM assets WHERE id = $1 AND status = 'pending_upload'`, [id]);
    },
    async get(id) {
      const result = await query<AssetRow>(`SELECT * FROM assets WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row ? mapAssetRow(row) : null;
    },
    async markUploaded(id) {
      const updated = await query<AssetRow>(
        `UPDATE assets
         SET status = 'uploaded', error = NULL, updated_at = now()
         WHERE id = $1 AND status = 'pending_upload'
         RETURNING *`,
        [id],
      );
      if (updated.rows[0]) return mapAssetRow(updated.rows[0]);
      const current = await query<AssetRow>(`SELECT * FROM assets WHERE id = $1`, [id]);
      return current.rows[0] ? mapAssetRow(current.rows[0]) : null;
    },
    async markProcessing(id) {
      await query(
        `UPDATE assets
         SET status = 'processing', updated_at = now()
         WHERE id = $1 AND status IN ('uploaded', 'processing', 'failed')`,
        [id],
      );
    },
    async markReady(id, derivatives, dimensions) {
      await query(
        `UPDATE assets
         SET status = 'ready',
             derivatives = $2::jsonb,
             width = COALESCE($3, width),
             height = COALESCE($4, height),
             error = NULL,
             updated_at = now()
         WHERE id = $1`,
        [
          id,
          JSON.stringify(derivatives),
          dimensions.width ?? null,
          dimensions.height ?? null,
        ],
      );
    },
    async markFailed(id, error) {
      await query(
        `UPDATE assets
         SET status = 'failed', error = $2, updated_at = now()
         WHERE id = $1 AND status <> 'ready'`,
        [id, error.slice(0, 500)],
      );
    },
    async saveExif(id, exif) {
      await query(
        `UPDATE assets
         SET exif = $2::jsonb,
             width = COALESCE($3, width),
             height = COALESCE($4, height),
             updated_at = now()
         WHERE id = $1`,
        [id, JSON.stringify(exif), exif.width ?? null, exif.height ?? null],
      );
    },
    async noteExifFailure(id, error) {
      await query(
        `UPDATE assets
         SET exif = COALESCE(exif, $2::jsonb), updated_at = now()
         WHERE id = $1`,
        [id, JSON.stringify({ hasGps: false, error: error.slice(0, 500) })],
      );
    },
    async listByUser(userId, limit) {
      const size = clampLibraryLimit(limit);
      const result = await query<AssetRow>(
        `SELECT * FROM assets
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [userId, size],
      );
      return result.rows.map((row) => mapAssetRow(row));
    },
    async close() {
      await pool.end();
    },
  };
}
