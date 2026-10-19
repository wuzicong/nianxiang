import { isMissingObjectError } from "./object-store.js";

/**
 * 只锁一行，避免一轮清理把完成接口堵死。
 * SKIP LOCKED 让另一个 Worker 跳过正在被完成或被清理的行。
 */
export const CLAIM_STALE_PENDING_UPLOAD_SQL = `
SELECT id, storage_key, derivatives
FROM assets
WHERE status = 'pending_upload'
  AND created_at < now() - ($1::int * interval '1 minute')
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED
`;

/** 状态条件写在 DELETE 上。完成接口若已改掉状态，这里删不到行。 */
export const DELETE_STALE_PENDING_UPLOAD_SQL = `
DELETE FROM assets
WHERE id = $1 AND status = 'pending_upload'
`;

export const DELETE_ALBUM_ASSET_LINKS_SQL = `
DELETE FROM album_assets
WHERE asset_id = $1
`;

const ASSET_ID_LOG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

export interface PendingUploadCleanupCounts {
  deleted: number;
  skipped: number;
  failed: number;
}

/**
 * 一行待清理的 pending_upload。
 * 调用方持有数据库事务：先 stageDelete，对象删成功后再 commit；失败则 abort，行会回来。
 */
export interface StalePendingClaim {
  readonly id: string;
  readonly objectKeys: readonly string[];
  stillPending(): Promise<boolean>;
  /**
   * 在未提交的事务里删除相册关联，并按 pending_upload 删除资产行。
   * 返回 false 表示状态已经不是 pending_upload，调用方必须 abort，且不能删对象。
   */
  stageDelete(): Promise<boolean>;
  commit(): Promise<void>;
  abort(): Promise<void>;
}

export interface PendingUploadCleaner {
  claimStalePendingUpload(ttlMinutes: number): Promise<StalePendingClaim | null>;
}

/** 原图键在前，其后是 derivatives 里出现过的键。空值和重复键丢掉。 */
export function pendingUploadObjectKeys(storageKey: string, derivatives: unknown): string[] {
  const keys: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    if (value.length === 0 || keys.includes(value)) return;
    keys.push(value);
  };
  push(storageKey);
  if (!derivatives || typeof derivatives !== "object" || Array.isArray(derivatives)) return keys;
  for (const value of Object.values(derivatives as Record<string, unknown>)) push(value);
  return keys;
}

function summary(counts: PendingUploadCleanupCounts): string {
  return `[worker] pending-upload cleanup deleted=${counts.deleted} skipped=${counts.skipped} failed=${counts.failed}`;
}

function visibleAssetId(id: string): string {
  return ASSET_ID_LOG.test(id) ? id : "invalid";
}

/**
 * 清理超过 TTL 的 pending_upload。
 * 对象删除发生在条件删除成功之后、事务提交之前：完成接口已经改掉状态时不会碰到对象。
 * 对象存储报缺失视为成功。其他删除失败会回滚数据库删除，下一轮再试。
 * 日志只有 asset id 和计数。
 */
export async function cleanupStalePendingUploads(input: {
  cleaner: PendingUploadCleaner;
  deleteObject: (key: string) => Promise<void>;
  ttlMinutes: number;
  limit: number;
  log?: (line: string) => void;
}): Promise<PendingUploadCleanupCounts> {
  const counts: PendingUploadCleanupCounts = { deleted: 0, skipped: 0, failed: 0 };
  const log = input.log ?? ((line: string) => console.log(line));
  const limit = Math.trunc(input.limit);
  const ttl = Math.trunc(input.ttlMinutes);
  if (!Number.isFinite(limit) || !Number.isFinite(ttl) || limit < 1 || ttl < 1) {
    log(summary(counts));
    return counts;
  }

  for (let examined = 0; examined < limit; examined += 1) {
    let claim: StalePendingClaim | null;
    try {
      claim = await input.cleaner.claimStalePendingUpload(ttl);
    } catch {
      counts.failed += 1;
      break;
    }
    if (!claim) break;

    const assetId = visibleAssetId(claim.id);
    let closed = false;
    try {
      if (!(await claim.stillPending())) {
        await claim.abort();
        closed = true;
        counts.skipped += 1;
        log(`[worker] pending-upload cleanup skip asset=${assetId}`);
        continue;
      }
      const staged = await claim.stageDelete();
      if (!staged) {
        await claim.abort();
        closed = true;
        counts.skipped += 1;
        log(`[worker] pending-upload cleanup skip asset=${assetId}`);
        continue;
      }
      for (const key of claim.objectKeys) {
        try {
          await input.deleteObject(key);
        } catch (err) {
          if (!isMissingObjectError(err)) throw err;
        }
      }
      await claim.commit();
      closed = true;
      counts.deleted += 1;
      log(`[worker] pending-upload cleanup asset=${assetId}`);
    } catch {
      if (!closed) {
        try {
          await claim.abort();
        } catch {
          // 连接断开时，数据库会回滚还没提交的删除。
        }
      }
      counts.failed += 1;
      log(`[worker] pending-upload cleanup failed asset=${assetId}`);
      break;
    }
  }

  log(summary(counts));
  return counts;
}
