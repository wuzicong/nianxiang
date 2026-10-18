import { Queue } from "bullmq";

export interface RedisConnectionSettings {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
  tls?: Record<string, never>;
}
import {
  JOB_NAMES,
  jobIdempotencyKey,
  type JobName,
  type MediaDerivativePayload,
  type MetaExifPayload,
} from "@memora/shared";

export function redisConnectionOptions(redisUrl: string): RedisConnectionSettings {
  const parsed = new URL(redisUrl);
  const dbPath = parsed.pathname.replace(/^\//, "");
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: dbPath ? Number(dbPath) : undefined,
    maxRetriesPerRequest: null,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  };
}

/** BullMQ 自定义 jobId 不能包含冒号，而契约幂等键用冒号分隔。 */
export function bullJobId(assetId: string, jobType: JobName): string {
  return jobIdempotencyKey(assetId, jobType).replaceAll(":", "__");
}

export const ASSET_JOB_ATTEMPTS = 3;

export function assetJobOptions(jobId: string) {
  return {
    jobId,
    attempts: ASSET_JOB_ATTEMPTS,
    backoff: { type: "exponential" as const, delay: 2_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  };
}

export function isDuplicateJobError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const named = err as { name?: string; message?: string };
  return named.name === "JobIdAlreadyExists" || /already exists/i.test(named.message ?? "");
}

export interface AssetPipelineInput {
  assetId: string;
  userId: string;
  storageKey: string;
  traceId?: string;
}

export interface AssetJobEnqueuer {
  enqueuePipeline(input: AssetPipelineInput): Promise<void>;
  close(): Promise<void>;
}

async function addIdempotent(
  queue: Queue,
  name: string,
  data: MediaDerivativePayload | MetaExifPayload,
  jobId: string,
): Promise<void> {
  try {
    await queue.add(name, data, assetJobOptions(jobId));
    return;
  } catch (err) {
    if (!isDuplicateJobError(err)) throw err;
  }
  const existing = await queue.getJob(jobId);
  if (!existing) return;
  if ((await existing.getState()) !== "failed") return;
  await existing.remove();
  await queue.add(name, data, assetJobOptions(jobId));
}

export function createAssetJobEnqueuer(redisUrl: string): AssetJobEnqueuer {
  const connection = redisConnectionOptions(redisUrl);
  const derivative = new Queue<MediaDerivativePayload>(JOB_NAMES.MEDIA_DERIVATIVE, {
    connection,
  });
  const exif = new Queue<MetaExifPayload>(JOB_NAMES.META_EXIF, { connection });

  return {
    async enqueuePipeline(input) {
      const trace = input.traceId ? { traceId: input.traceId } : {};
      await addIdempotent(
        derivative,
        JOB_NAMES.MEDIA_DERIVATIVE,
        {
          assetId: input.assetId,
          userId: input.userId,
          storageKey: input.storageKey,
          ...trace,
        },
        bullJobId(input.assetId, JOB_NAMES.MEDIA_DERIVATIVE),
      );
      await addIdempotent(
        exif,
        JOB_NAMES.META_EXIF,
        {
          assetId: input.assetId,
          userId: input.userId,
          ...trace,
        },
        bullJobId(input.assetId, JOB_NAMES.META_EXIF),
      );
    },
    async close() {
      await derivative.close();
      await exif.close();
    },
  };
}
