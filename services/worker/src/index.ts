import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { ALL_JOB_NAMES, type JobName } from "@memora/shared";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

function stubProcessor(jobName: JobName) {
  return async (job: { id?: string; name: string; data: unknown }) => {
    console.log(`[worker] stub ${jobName} id=${job.id}`, job.data);
    return { ok: true, stub: true };
  };
}

console.log(`[memora-worker] connecting redis=${redisUrl}`);

for (const name of ALL_JOB_NAMES) {
  // P0：每个 Job 名注册独立 Worker（后续合并为路由处理器）
  new Worker(name, stubProcessor(name), {
    connection,
    concurrency: 1,
  });
}

console.log(
  `[memora-worker] BullMQ stubs registered on queue pattern; jobs: ${ALL_JOB_NAMES.join(", ")}`,
);

// 保持进程存活
process.on("SIGINT", () => {
  connection.disconnect();
  process.exit(0);
});
