import {
  createAlbumRepository,
  createAssetJobEnqueuer,
  createAssetRepository,
  createAuthRepository,
  createObjectStore,
  createRedisIncrCounter,
  objectStoreConfigFromRuntime,
  safeErrorMessage,
} from "@memora/storage";
import { config, logDeployWarnings } from "./config.js";
import { createMemoryIncrCounter, createShareRateLimiter } from "./shares/rate-limit.js";
import { createApp } from "./server.js";

const objects = createObjectStore(objectStoreConfigFromRuntime(config));
const assets = createAssetRepository({
  connectionString: config.databaseUrl,
  applicationName: "memora-api",
});
const auth = createAuthRepository({
  connectionString: config.databaseUrl,
  applicationName: "memora-api",
});
const albums = createAlbumRepository({
  connectionString: config.databaseUrl,
  applicationName: "memora-api",
});
const jobs = createAssetJobEnqueuer(config.redisUrl);
const shareCounter = createRedisIncrCounter(config.redisUrl);
let shareRedisWarnedAt = 0;
const shareRateLimit = createShareRateLimiter(shareCounter, config.shareRateWindowMs, {
  fallback: createMemoryIncrCounter(),
  onError(err) {
    const now = Date.now();
    if (now - shareRedisWarnedAt < 30_000) return;
    shareRedisWarnedAt = now;
    console.error("[memora-api] share rate-limit redis failed", safeErrorMessage(err));
  },
});
const app = createApp({ config, objects, assets, jobs, auth, albums, shareRateLimit });

const server = app.listen(config.port, "0.0.0.0", () => {
  logDeployWarnings();
  console.log(
    `[memora-api] listening on :${config.port} (DEPLOY_MODE=${config.deployMode} STORAGE_BACKEND=${config.storageBackend} presign=${config.presignTtlMinutes}m bucket=${config.s3.bucket})`,
  );
});

async function shutdown(): Promise<void> {
  server.close();
  await jobs.close().catch((err) => {
    console.error("[memora-api] queue close failed", safeErrorMessage(err));
  });
  await shareCounter.close().catch((err) => {
    console.error("[memora-api] share rate-limit close failed", safeErrorMessage(err));
  });
  await assets.close().catch((err) => {
    console.error("[memora-api] db close failed", safeErrorMessage(err));
  });
  await auth.close().catch((err) => {
    console.error("[memora-api] auth db close failed", safeErrorMessage(err));
  });
  await albums.close().catch((err) => {
    console.error("[memora-api] album db close failed", safeErrorMessage(err));
  });
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
