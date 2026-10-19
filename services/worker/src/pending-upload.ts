import {
  cleanupStalePendingUploads,
  type PendingUploadCleaner,
  type PendingUploadCleanupCounts,
} from "@memora/storage";

/** 不占用总册里冻结的 8 个 Job 名。 */
export const PENDING_UPLOAD_QUEUE_NAME = "maintenance.pending-upload";

export const PENDING_UPLOAD_SCHEDULER_ID = "pending-upload-cleanup";

const DEFAULT_INTERVAL_MINUTES = 10;

export function pendingUploadSchedule(intervalMinutes: number): {
  every: number;
  template: {
    name: "sweep";
    data: Record<string, never>;
    opts: { removeOnComplete: number; removeOnFail: number };
  };
} {
  const minutes =
    Number.isInteger(intervalMinutes) && intervalMinutes > 0
      ? intervalMinutes
      : DEFAULT_INTERVAL_MINUTES;
  return {
    every: minutes * 60_000,
    template: {
      name: "sweep",
      data: {},
      opts: { removeOnComplete: 100, removeOnFail: 100 },
    },
  };
}

export async function runPendingUploadSweep(input: {
  cleaner: PendingUploadCleaner;
  deleteObject: (key: string) => Promise<void>;
  ttlMinutes: number;
  limit: number;
  log?: (line: string) => void;
}): Promise<PendingUploadCleanupCounts> {
  return cleanupStalePendingUploads(input);
}
