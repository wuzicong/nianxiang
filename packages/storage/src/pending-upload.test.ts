import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  pendingUploadTtlFloorMinutes,
  resolveMaxPendingUploadsPerUser,
  resolvePendingUploadCleanupBatch,
  resolvePendingUploadCleanupIntervalMinutes,
  resolvePendingUploadTtlMinutes,
} from "@memora/shared";
import { loadRuntimeConfig } from "./runtime-config.js";
import { isMissingObjectError } from "./object-store.js";
import {
  CLAIM_STALE_PENDING_UPLOAD_SQL,
  DELETE_ALBUM_ASSET_LINKS_SQL,
  DELETE_STALE_PENDING_UPLOAD_SQL,
  cleanupStalePendingUploads,
  pendingUploadObjectKeys,
  type PendingUploadCleaner,
  type StalePendingClaim,
} from "./pending-upload.js";

const HOUR = 60 * 60_000;
const NOW = Date.parse("2026-04-01T12:00:00.000Z");
const SECRET_KEY = "users/u/originals/stale?X-Amz-Signature=supersecret";
const DERIVATIVE_KEY = "users/u/derivatives/stale/thumb.webp?X-Amz-Signature=supersecret";

interface MemoryAsset {
  id: string;
  status: "pending_upload" | "uploaded" | "processing" | "ready" | "failed";
  createdAtMs: number;
  storageKey: string;
  derivativeKeys: string[];
}

interface MemoryLink {
  albumId: string;
  assetId: string;
}

function createMemoryCleaner(options: {
  rows: MemoryAsset[];
  links: MemoryLink[];
  nowMs: number;
}): PendingUploadCleaner {
  const locked = new Set<string>();
  return {
    async claimStalePendingUpload(ttlMinutes: number) {
      const cutoff = options.nowMs - ttlMinutes * 60_000;
      const row = options.rows.find(
        (item) =>
          !locked.has(item.id) &&
          item.status === "pending_upload" &&
          item.createdAtMs < cutoff,
      );
      if (!row) return null;
      locked.add(row.id);
      await Promise.resolve();
      let closed = false;
      let staged = false;
      const removedLinks: MemoryLink[] = [];
      const close = () => {
        if (closed) return;
        closed = true;
        locked.delete(row.id);
      };
      const claim: StalePendingClaim = {
        id: row.id,
        objectKeys: [row.storageKey, ...row.derivativeKeys],
        async stillPending() {
          return row.status === "pending_upload";
        },
        async stageDelete() {
          if (closed || row.status !== "pending_upload") return false;
          staged = true;
          for (let index = options.links.length - 1; index >= 0; index -= 1) {
            const link = options.links[index];
            if (link?.assetId !== row.id) continue;
            removedLinks.push(link);
            options.links.splice(index, 1);
          }
          const rowIndex = options.rows.indexOf(row);
          if (rowIndex >= 0) options.rows.splice(rowIndex, 1);
          return true;
        },
        async commit() {
          close();
        },
        async abort() {
          if (closed) return;
          if (staged) {
            if (!options.rows.includes(row)) options.rows.push(row);
            options.links.push(...removedLinks);
          }
          close();
        },
      };
      return claim;
    },
  };
}

function asset(partial: Partial<MemoryAsset> & Pick<MemoryAsset, "id" | "status" | "createdAtMs">): MemoryAsset {
  return {
    storageKey: `users/u/originals/${partial.id}`,
    derivativeKeys: [],
    ...partial,
  };
}

test("pending upload ttl is twice the presign ttl and at least one hour", () => {
  assert.equal(pendingUploadTtlFloorMinutes(10), 60);
  assert.equal(pendingUploadTtlFloorMinutes(15), 60);
  assert.equal(pendingUploadTtlFloorMinutes(40), 80);
  assert.equal(resolvePendingUploadTtlMinutes(undefined, 10), 60);
  assert.equal(resolvePendingUploadTtlMinutes("", 10), 60);
  assert.equal(resolvePendingUploadTtlMinutes("nope", 10), 60);
  assert.equal(resolvePendingUploadTtlMinutes("0", 10), 60);
  assert.equal(resolvePendingUploadTtlMinutes("15", 10), 60);
  assert.equal(resolvePendingUploadTtlMinutes("180", 10), 180);
  assert.equal(resolvePendingUploadTtlMinutes("70", 40), 80);
  assert.equal(resolvePendingUploadTtlMinutes("90", 40), 90);
  assert.equal(resolvePendingUploadTtlMinutes("999999", 10), 60);
  assert.equal(resolveMaxPendingUploadsPerUser(undefined), 50);
  assert.equal(resolveMaxPendingUploadsPerUser("2"), 2);
  assert.equal(resolveMaxPendingUploadsPerUser("0"), 50);
  assert.equal(resolveMaxPendingUploadsPerUser("nope"), 50);
  assert.equal(resolveMaxPendingUploadsPerUser("50000"), 50);
  assert.equal(resolvePendingUploadCleanupBatch("10"), 10);
  assert.equal(resolvePendingUploadCleanupBatch("-3"), 50);
  assert.equal(resolvePendingUploadCleanupIntervalMinutes("5"), 5);
  assert.equal(resolvePendingUploadCleanupIntervalMinutes("1.5"), 10);
});

test("runtime config warns without echoing the invalid raw value", () => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const secret = "paste-secret-value";
    const config = loadRuntimeConfig({
      PRESIGN_TTL_MINUTES: "10",
      PENDING_UPLOAD_TTL_MINUTES: secret,
      MAX_PENDING_UPLOADS_PER_USER: "2",
    });
    assert.equal(config.pendingUploadTtlMinutes, 60);
    assert.equal(config.maxPendingUploadsPerUser, 2);
    assert.equal(config.pendingUploadCleanupBatch, 50);
    assert.equal(config.pendingUploadCleanupIntervalMinutes, 10);
    assert.equal(warnings.some((line) => line.includes(secret)), false);
    assert.equal(warnings.some((line) => line.includes("回落 60")), true);
  } finally {
    console.warn = original;
  }
});

test("object keys keep the original and distinct derivative keys", () => {
  assert.deepEqual(
    pendingUploadObjectKeys("original", { thumb: "thumb", preview: "", hero: "original" }),
    ["original", "thumb"],
  );
  assert.deepEqual(pendingUploadObjectKeys("original", null), ["original"]);
  assert.equal(isMissingObjectError(Object.assign(new Error("missing"), { name: "NoSuchKey" })), true);
  assert.equal(isMissingObjectError(Object.assign(new Error("missing"), { name: "NotFound" })), true);
  assert.equal(
    isMissingObjectError(Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } })),
    true,
  );
  assert.equal(isMissingObjectError(new Error("AccessDenied")), false);
});

test("cleanup removes expired pending uploads and leaves fresh or finished rows", async () => {
  const rows: MemoryAsset[] = [
    asset({
      id: "stale",
      status: "pending_upload",
      createdAtMs: NOW - 2 * HOUR,
      storageKey: SECRET_KEY,
      derivativeKeys: [DERIVATIVE_KEY],
    }),
    asset({
      id: "boundary",
      status: "pending_upload",
      createdAtMs: NOW - HOUR,
    }),
    asset({
      id: "fresh",
      status: "pending_upload",
      createdAtMs: NOW - HOUR + 1,
    }),
    asset({ id: "uploaded", status: "uploaded", createdAtMs: NOW - 3 * HOUR }),
    asset({ id: "ready", status: "ready", createdAtMs: NOW - 3 * HOUR }),
    asset({ id: "processing", status: "processing", createdAtMs: NOW - 3 * HOUR }),
    asset({ id: "failed", status: "failed", createdAtMs: NOW - 3 * HOUR }),
  ];
  const links: MemoryLink[] = [
    { albumId: "album-1", assetId: "stale" },
    { albumId: "album-1", assetId: "fresh" },
    { albumId: "album-2", assetId: "ready" },
  ];
  const deleted: string[] = [];
  const logs: string[] = [];
  const cleaner = createMemoryCleaner({ rows, links, nowMs: NOW });
  const first = await cleanupStalePendingUploads({
    cleaner,
    ttlMinutes: 60,
    limit: 10,
    log: (line) => logs.push(line),
    deleteObject: async (key) => {
      deleted.push(key);
      if (key === SECRET_KEY) {
        throw Object.assign(new Error(key), { name: "NoSuchKey" });
      }
    },
  });
  assert.deepEqual(first, { deleted: 1, skipped: 0, failed: 0 });
  assert.deepEqual(deleted, [SECRET_KEY, DERIVATIVE_KEY]);
  assert.deepEqual(
    rows.map((row) => row.id).sort(),
    ["boundary", "failed", "fresh", "processing", "ready", "uploaded"],
  );
  assert.deepEqual(links, [
    { albumId: "album-1", assetId: "fresh" },
    { albumId: "album-2", assetId: "ready" },
  ]);
  const again = await cleanupStalePendingUploads({
    cleaner,
    ttlMinutes: 60,
    limit: 10,
    log: (line) => logs.push(line),
    deleteObject: async (key) => {
      deleted.push(key);
    },
  });
  assert.equal(again.deleted, 0);
  const joined = logs.join("\n");
  assert.match(joined, /asset=stale/);
  assert.match(joined, /deleted=1 skipped=0 failed=0/);
  assert.equal(joined.includes("X-Amz-Signature"), false);
  assert.equal(joined.includes("supersecret"), false);
  assert.equal(joined.includes("users/"), false);
});

test("cleanup stops before object deletion when the status condition fails", async () => {
  const deleted: string[] = [];
  let aborted = false;
  let committed = false;
  let staged = false;
  const logs: string[] = [];
  const secret = "users/u/originals/done?X-Amz-Signature=supersecret";
  let claims = 0;
  const cleaner: PendingUploadCleaner = {
    async claimStalePendingUpload() {
      claims += 1;
      if (claims > 1) return null;
      return {
        id: "done-asset",
        objectKeys: [secret],
        async stillPending() {
          return true;
        },
        async stageDelete() {
          staged = true;
          return false;
        },
        async commit() {
          committed = true;
        },
        async abort() {
          aborted = true;
        },
      };
    },
  };
  const counts = await cleanupStalePendingUploads({
    cleaner,
    ttlMinutes: 60,
    limit: 5,
    log: (line) => logs.push(line),
    deleteObject: async (key) => {
      deleted.push(key);
    },
  });
  assert.deepEqual(counts, { deleted: 0, skipped: 1, failed: 0 });
  assert.equal(staged, true);
  assert.equal(aborted, true);
  assert.equal(committed, false);
  assert.deepEqual(deleted, []);
  assert.equal(logs.join("\n").includes("supersecret"), false);
  assert.match(logs.join("\n"), /skip asset=done-asset/);
});

test("cleanup does not delete objects when the claim is no longer pending", async () => {
  let staged = false;
  const cleaner: PendingUploadCleaner = {
    async claimStalePendingUpload() {
      return {
        id: "flipped",
        objectKeys: ["users/u/originals/flipped"],
        async stillPending() {
          return false;
        },
        async stageDelete() {
          staged = true;
          return true;
        },
        async commit() {},
        async abort() {},
      };
    },
  };
  let claims = 0;
  const wrapped: PendingUploadCleaner = {
    async claimStalePendingUpload(ttl) {
      claims += 1;
      if (claims > 1) return null;
      return cleaner.claimStalePendingUpload(ttl);
    },
  };
  const deleted: string[] = [];
  const counts = await cleanupStalePendingUploads({
    cleaner: wrapped,
    ttlMinutes: 60,
    limit: 3,
    deleteObject: async (key) => {
      deleted.push(key);
    },
  });
  assert.deepEqual(counts, { deleted: 0, skipped: 1, failed: 0 });
  assert.equal(staged, false);
  assert.deepEqual(deleted, []);
});

test("a storage error rolls the pending row back and stops the batch", async () => {
  const rows = [
    asset({ id: "older", status: "pending_upload", createdAtMs: NOW - 3 * HOUR }),
    asset({ id: "newer", status: "pending_upload", createdAtMs: NOW - 2 * HOUR }),
  ];
  const links: MemoryLink[] = [{ albumId: "album", assetId: "older" }];
  const logs: string[] = [];
  const counts = await cleanupStalePendingUploads({
    cleaner: createMemoryCleaner({ rows, links, nowMs: NOW }),
    ttlMinutes: 60,
    limit: 10,
    log: (line) => logs.push(line),
    deleteObject: async () => {
      throw new Error("http://127.0.0.1:9000/memora-local/k?X-Amz-Signature=supersecret");
    },
  });
  assert.deepEqual(counts, { deleted: 0, skipped: 0, failed: 1 });
  assert.deepEqual(
    rows.map((row) => row.id).sort(),
    ["newer", "older"],
  );
  assert.deepEqual(links, [{ albumId: "album", assetId: "older" }]);
  assert.equal(logs.join("\n").includes("supersecret"), false);
  assert.equal(logs.join("\n").includes("http"), false);
  assert.match(logs.join("\n"), /failed asset=older/);
});

test("cleanup honors the batch limit", async () => {
  const rows = ["a", "b", "c"].map((id, index) =>
    asset({
      id,
      status: "pending_upload",
      createdAtMs: NOW - (index + 2) * HOUR,
    }),
  );
  const counts = await cleanupStalePendingUploads({
    cleaner: createMemoryCleaner({ rows, links: [], nowMs: NOW }),
    ttlMinutes: 60,
    limit: 2,
    deleteObject: async () => {},
  });
  assert.equal(counts.deleted, 2);
  assert.equal(rows.length, 1);
});

test("two cleaners do not delete the same pending row", async () => {
  const rows = ["a", "b", "c", "d"].map((id, index) =>
    asset({
      id,
      status: "pending_upload",
      createdAtMs: NOW - (index + 2) * HOUR,
    }),
  );
  const seen: string[] = [];
  const cleaner = createMemoryCleaner({ rows, links: [], nowMs: NOW });
  const [first, second] = await Promise.all([
    cleanupStalePendingUploads({
      cleaner,
      ttlMinutes: 60,
      limit: 10,
      deleteObject: async (key) => {
        seen.push(key);
      },
    }),
    cleanupStalePendingUploads({
      cleaner,
      ttlMinutes: 60,
      limit: 10,
      deleteObject: async (key) => {
        seen.push(key);
      },
    }),
  ]);
  assert.equal(first.deleted + second.deleted, 4);
  assert.equal(rows.length, 0);
  assert.equal(new Set(seen).size, seen.length);
});

test("claim and delete statements keep the pending_upload condition and row lock", () => {
  assert.match(CLAIM_STALE_PENDING_UPLOAD_SQL, /status = 'pending_upload'/);
  assert.match(CLAIM_STALE_PENDING_UPLOAD_SQL, /FOR UPDATE SKIP LOCKED/);
  assert.match(CLAIM_STALE_PENDING_UPLOAD_SQL, /LIMIT 1/);
  assert.match(DELETE_STALE_PENDING_UPLOAD_SQL, /status = 'pending_upload'/);
  assert.match(DELETE_ALBUM_ASSET_LINKS_SQL, /album_assets/);
  const source = readFileSync(new URL("./assets.ts", import.meta.url), "utf8");
  assert.match(source, /CLAIM_STALE_PENDING_UPLOAD_SQL/);
  assert.match(source, /DELETE_STALE_PENDING_UPLOAD_SQL/);
  assert.match(source, /DELETE_ALBUM_ASSET_LINKS_SQL/);
  assert.match(source, /pg_advisory_xact_lock/);
});
