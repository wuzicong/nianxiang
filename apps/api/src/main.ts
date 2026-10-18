import cors from "cors";
import express from "express";
import { bucketName } from "@memora/shared";
import { config, logDeployWarnings, uploadPlaceholderResponse } from "./config.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "memora-api",
    deployMode: config.deployMode,
    memoraEnv: config.memoraEnv,
    storage: {
      backend: config.storageBackend,
      bucket: config.s3.bucket,
      expectedBucketPattern: bucketName(config.memoraEnv),
    },
  });
});

/** v1 上传预签名占位 — POST /api/v1/assets/upload-url */
app.post("/api/v1/assets/upload-url", (req, res) => {
  const { filename, mime, size } = req.body ?? {};
  if (!filename || !mime || typeof size !== "number") {
    res.status(400).json({
      error: "filename, mime, size required",
    });
    return;
  }
  res.status(501).json(uploadPlaceholderResponse(filename, mime, size));
});

const port = config.port;
logDeployWarnings();
app.listen(port, () => {
  console.log(
    `[memora-api] listening on :${port} (DEPLOY_MODE=${config.deployMode} STORAGE_BACKEND=${config.storageBackend} presign=${config.presignTtlMinutes}m)`,
  );
});
