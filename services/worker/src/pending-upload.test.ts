import assert from "node:assert/strict";
import test from "node:test";
import type { PendingUploadCleaner } from "@memora/storage";
import { pendingUploadSchedule, runPendingUploadSweep } from "./pending-upload.js";

test("pending upload schedule repeats without putting secrets in the job", () => {
  const schedule = pendingUploadSchedule(10);
  assert.equal(schedule.every, 600_000);
  assert.equal(schedule.template.name, "sweep");
  assert.deepEqual(schedule.template.data, {});
  assert.equal(schedule.template.opts.removeOnComplete, 100);
  assert.equal(pendingUploadSchedule(0).every, 600_000);
  assert.equal(JSON.stringify(schedule).includes("http"), false);
  assert.equal(JSON.stringify(schedule).includes("X-Amz"), false);
});

test("sweep forwards the configured ttl and batch limit", async () => {
  const seen: Array<{ ttlMinutes: number }> = [];
  const cleaner: PendingUploadCleaner = {
    async claimStalePendingUpload(ttlMinutes) {
      seen.push({ ttlMinutes });
      return null;
    },
  };
  const logs: string[] = [];
  const counts = await runPendingUploadSweep({
    cleaner,
    ttlMinutes: 120,
    limit: 3,
    deleteObject: async () => {
      throw new Error("unused");
    },
    log: (line) => logs.push(line),
  });
  assert.deepEqual(counts, { deleted: 0, skipped: 0, failed: 0 });
  assert.deepEqual(seen, [{ ttlMinutes: 120 }]);
  assert.match(logs.join("\n"), /deleted=0 skipped=0 failed=0/);
});
