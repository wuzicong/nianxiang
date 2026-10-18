import pg from "pg";
import type { DerivativeSize } from "@memora/shared";
import { safeErrorMessage } from "./redact.js";
import { ASSET_SCHEMA_SQL } from "./schema.js";

const { Pool } = pg;

const SCHEMA_LOCK = "4815162342";

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
  close(): Promise<void>;
}

interface AssetRow {
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

function mapRow(row: AssetRow): AssetRecord {
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
}): AssetRepository {
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
      await client.query("SELECT pg_advisory_lock($1::bigint)", [SCHEMA_LOCK]);
      await client.query(ASSET_SCHEMA_SQL);
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [SCHEMA_LOCK]);
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

  return {
    ready,
    async insertPending(asset) {
      await query(
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
    },
    async deletePending(id) {
      await query(`DELETE FROM assets WHERE id = $1 AND status = 'pending_upload'`, [id]);
    },
    async get(id) {
      const result = await query<AssetRow>(`SELECT * FROM assets WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async markUploaded(id) {
      const updated = await query<AssetRow>(
        `UPDATE assets
         SET status = 'uploaded', error = NULL, updated_at = now()
         WHERE id = $1 AND status = 'pending_upload'
         RETURNING *`,
        [id],
      );
      if (updated.rows[0]) return mapRow(updated.rows[0]);
      const current = await query<AssetRow>(`SELECT * FROM assets WHERE id = $1`, [id]);
      return current.rows[0] ? mapRow(current.rows[0]) : null;
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
    async close() {
      await pool.end();
    },
  };
}
