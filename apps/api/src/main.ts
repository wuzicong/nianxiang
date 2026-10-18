import {
  createAssetJobEnqueuer,
  createAssetRepository,
  createAuthRepository,
  createObjectStore,
  objectStoreConfigFromRuntime,
  safeErrorMessage,
} from "@memora/storage";
import { config, logDeployWarnings } from "./config.js";
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
const jobs = createAssetJobEnqueuer(config.redisUrl);
const app = createApp({ config, objects, assets, jobs, auth });

const server = app.listen(config.port, () => {
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
  await assets.close().catch((err) => {
    console.error("[memora-api] db close failed", safeErrorMessage(err));
  });
  await auth.close().catch((err) => {
    console.error("[memora-api] auth db close failed", safeErrorMessage(err));
  });
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
