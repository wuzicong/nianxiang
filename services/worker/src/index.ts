import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import {
  ALL_JOB_NAMES,
  JOB_NAMES,
  type JobName,
  type MediaDerivativePayload,
  type MetaExifPayload,
} from "@memora/shared";
import {
  bucketMatchesContract,
  createAssetRepository,
  createObjectStore,
  expectedBucket,
  loadRuntimeConfig,
  objectStoreConfigFromRuntime,
  redisConnectionOptions,
  runtimeWarnings,
  safeErrorMessage,
} from "@memora/storage";
import { runMediaDerivative } from "./derivative.js";
import { runMetaExif } from "./exif.js";
import { onJobFailed } from "./failure.js";
import { startHealthServer, workerHealthPort } from "./health.js";
import {
  PENDING_UPLOAD_QUEUE_NAME,
  PENDING_UPLOAD_SCHEDULER_ID,
  pendingUploadSchedule,
  runPendingUploadSweep,
} from "./pending-upload.js";

const runtime = loadRuntimeConfig();
const objects = createObjectStore(objectStoreConfigFromRuntime(runtime));
const assets = createAssetRepository({
  connectionString: runtime.databaseUrl,
  applicationName: "memora-worker",
});
const connections: Redis[] = [];
const workers: Worker[] = [];
const maintenanceQueue = new Queue(PENDING_UPLOAD_QUEUE_NAME, {
  connection: workerConnection(),
});

function workerConnection(): Redis {
  const connection = new Redis(redisConnectionOptions(runtime.redisUrl));
  connections.push(connection);
  return connection;
}

function redisHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "6379"}`;
  } catch {
    return "invalid-redis-url";
  }
}

function stubProcessor(jobName: JobName) {
  return async (job: Job) => {
    console.log(`[worker] stub ${jobName} id=${job.id ?? "unknown"}`);
    return { ok: true, stub: true };
  };
}

function assertBucket(): void {
  if (!bucketMatchesContract(runtime)) {
    throw new Error(`bucket_misconfigured:${expectedBucket(runtime)}`);
  }
}

for (const warning of runtimeWarnings(runtime)) {
  console.warn(`[memora-worker] ${warning}`);
}

console.log(
  `[memora-worker] redis=${redisHost(runtime.redisUrl)} bucket=${runtime.s3.bucket} kms=${runtime.s3.kmsKeyId ? "on" : "off"}`,
);

const implemented = new Set<JobName>([JOB_NAMES.MEDIA_DERIVATIVE, JOB_NAMES.META_EXIF]);

for (const name of ALL_JOB_NAMES) {
  if (implemented.has(name)) continue;
  workers.push(
    new Worker(name, stubProcessor(name), {
      connection: workerConnection(),
      concurrency: 1,
    }),
  );
}

const derivativeWorker = new Worker<MediaDerivativePayload>(
  JOB_NAMES.MEDIA_DERIVATIVE,
  async (job) => {
    assertBucket();
    console.log(
      `[worker] media.derivative start asset=${job.data.assetId} attempt=${job.attemptsMade + 1}`,
    );
    await runMediaDerivative(job.data, { objects, assets });
    console.log(`[worker] media.derivative done asset=${job.data.assetId}`);
  },
  { connection: workerConnection(), concurrency: 2, lockDuration: 120_000 },
);
derivativeWorker.on("failed", (job, err) => {
  if (!job) return;
  void onJobFailed({
    label: "media.derivative",
    assetId: job.data.assetId,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 1,
    err,
    markFailed: (id, error) => assets.markFailed(id, error),
  });
});
workers.push(derivativeWorker);

const exifWorker = new Worker<MetaExifPayload>(
  JOB_NAMES.META_EXIF,
  async (job) => {
    assertBucket();
    console.log(`[worker] meta.exif start asset=${job.data.assetId} attempt=${job.attemptsMade + 1}`);
    await runMetaExif(job.data, { objects, assets });
    console.log(`[worker] meta.exif done asset=${job.data.assetId}`);
  },
  { connection: workerConnection(), concurrency: 2, lockDuration: 120_000 },
);
exifWorker.on("failed", (job, err) => {
  if (!job) return;
  void onJobFailed({
    label: "meta.exif",
    assetId: job.data.assetId,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 1,
    err,
    noteExifFailure: (id, error) => assets.noteExifFailure(id, error),
  });
});
workers.push(exifWorker);

const pendingUploadWorker = new Worker(
  PENDING_UPLOAD_QUEUE_NAME,
  async () =>
    runPendingUploadSweep({
      cleaner: assets,
      deleteObject: (key) => objects.deleteObject(key),
      ttlMinutes: runtime.pendingUploadTtlMinutes,
      limit: runtime.pendingUploadCleanupBatch,
    }),
  { connection: workerConnection(), concurrency: 1, lockDuration: 120_000 },
);
pendingUploadWorker.on("failed", (_job, err) => {
  console.error("[memora-worker] pending-upload cleanup failed", safeErrorMessage(err));
});
workers.push(pendingUploadWorker);

const pendingSchedule = pendingUploadSchedule(runtime.pendingUploadCleanupIntervalMinutes);
void maintenanceQueue
  .upsertJobScheduler(PENDING_UPLOAD_SCHEDULER_ID, { every: pendingSchedule.every }, pendingSchedule.template)
  .catch((err) => {
    console.error("[memora-worker] pending-upload schedule failed", safeErrorMessage(err));
  });

console.log(
  `[memora-worker] ready; derivative+exif live, pending-upload every ${runtime.pendingUploadCleanupIntervalMinutes}m ttl=${runtime.pendingUploadTtlMinutes}m batch=${runtime.pendingUploadCleanupBatch}, stubs: ${ALL_JOB_NAMES.filter((name) => !implemented.has(name)).join(", ")}`,
);

const healthServer = startHealthServer(workerHealthPort(process.env.WORKER_HEALTH_PORT));
healthServer.on("error", (err) => {
  console.error("[memora-worker] health server failed", safeErrorMessage(err));
  process.exit(1);
});
healthServer.on("listening", () => {
  const address = healthServer.address();
  const port =
    address && typeof address === "object"
      ? address.port
      : workerHealthPort(process.env.WORKER_HEALTH_PORT);
  console.log(`[memora-worker] health on :${port}`);
});

async function shutdown(): Promise<void> {
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  await Promise.all(workers.map((worker) => worker.close()));
  await maintenanceQueue.close();
  await Promise.all(connections.map((connection) => connection.quit()));
  await assets.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown().catch((err) => {
    console.error("[memora-worker] shutdown failed", safeErrorMessage(err));
    process.exit(1);
  });
});
process.on("SIGTERM", () => {
  void shutdown().catch((err) => {
    console.error("[memora-worker] shutdown failed", safeErrorMessage(err));
    process.exit(1);
  });
});
