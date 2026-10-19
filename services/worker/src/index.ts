import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { Server } from "node:http";
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
import { startWorkerHealthServer, workerHealthHost } from "./health.js";

const runtime = loadRuntimeConfig();
const objects = createObjectStore(objectStoreConfigFromRuntime(runtime));
const assets = createAssetRepository({
  connectionString: runtime.databaseUrl,
  applicationName: "memora-worker",
});
const connections: Redis[] = [];
const workers: Worker[] = [];

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

console.log(
  `[memora-worker] ready; derivative+exif live, stubs: ${ALL_JOB_NAMES.filter((name) => !implemented.has(name)).join(", ")}`,
);

const healthHost = workerHealthHost(process.env.WORKER_HEALTH_HOST);
const healthPortRaw = Number(process.env.WORKER_HEALTH_PORT ?? "3002");
const healthPort =
  Number.isInteger(healthPortRaw) && healthPortRaw > 0 && healthPortRaw < 65536 ? healthPortRaw : 3002;
const probeRedis = new Redis(redisConnectionOptions(runtime.redisUrl));
connections.push(probeRedis);
const healthServer: Server = startWorkerHealthServer({
  port: healthPort,
  host: healthHost,
  probe: async () => {
    const reply = await Promise.race([
      probeRedis.ping(),
      new Promise<string>((_resolve, reject) => {
        setTimeout(() => reject(new Error("redis ping timeout")), 2_000);
      }),
    ]);
    return reply === "PONG";
  },
});
console.log(`[memora-worker] health on ${healthHost}:${healthPort}`);

async function shutdown(): Promise<void> {
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  await Promise.all(workers.map((worker) => worker.close()));
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
