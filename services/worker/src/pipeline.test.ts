import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { derivativeObjectKey } from "@memora/shared";
import type { AssetRecord, AssetRepository, ExifSummary, ObjectStore } from "@memora/storage";
import { runMediaDerivative } from "./derivative.js";
import { runMetaExif } from "./exif.js";
import { onJobFailed } from "./failure.js";
import { readImageSummary, renderDerivatives } from "./render.js";

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "asset1",
    userId: "local",
    storageKey: "users/local/originals/asset1",
    filename: "pixel.png",
    contentType: "image/png",
    sizeBytes: 10,
    status: "uploaded",
    width: null,
    height: null,
    derivatives: {},
    exif: null,
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("renderDerivatives writes three webp sizes and does not enlarge", async () => {
  const png = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 20, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();
  const rendered = await renderDerivatives(png);
  assert.equal(rendered.width, 800);
  assert.equal(rendered.height, 600);
  assert.deepEqual(
    rendered.files.map((file) => file.size),
    ["thumb", "preview", "hero"],
  );
  for (const file of rendered.files) {
    assert.equal(file.body.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(file.body.subarray(8, 12).toString("ascii"), "WEBP");
  }
  const thumb = await sharp(rendered.files[0].body).metadata();
  const preview = await sharp(rendered.files[1].body).metadata();
  assert.equal(thumb.width, 480);
  assert.equal(thumb.height, 360);
  assert.equal(preview.width, 800);
  assert.equal(preview.height, 600);

  const summary = await readImageSummary(png);
  assert.equal(summary.format, "png");
  assert.equal(summary.hasGps, false);
  assert.equal(summary.width, 800);
});

test("runMediaDerivative stores derivative keys and runMetaExif keeps GPS in the record only", async () => {
  const png = await sharp({
    create: { width: 32, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();
  const current = asset();
  const puts: Array<{ key: string; contentType: string; cacheControl?: string; bytes: number }> = [];
  const objects: Pick<ObjectStore, "getBuffer" | "putObject"> = {
    async getBuffer(key) {
      assert.equal(key, current.storageKey);
      return png;
    },
    async putObject(input) {
      puts.push({
        key: input.key,
        contentType: input.contentType,
        cacheControl: input.cacheControl,
        bytes: input.body.length,
      });
    },
  };
  const saved: { exif: ExifSummary | null } = { exif: null };
  const assets = {
    async get() {
      return current;
    },
    async markProcessing(id: string) {
      assert.equal(id, current.id);
      current.status = "processing";
    },
    async markReady(
      id: string,
      derivatives: AssetRecord["derivatives"],
      dimensions: { width?: number; height?: number },
    ) {
      assert.equal(id, current.id);
      current.status = "ready";
      current.derivatives = derivatives;
      current.width = dimensions.width ?? null;
      current.height = dimensions.height ?? null;
    },
    async saveExif(_id: string, exif: ExifSummary) {
      saved.exif = exif;
      current.exif = exif;
    },
  } as Pick<AssetRepository, "get" | "markProcessing" | "markReady" | "saveExif">;

  await runMediaDerivative(
    { assetId: current.id, userId: current.userId, storageKey: current.storageKey },
    { objects, assets },
  );
  assert.equal(current.status, "ready");
  assert.deepEqual(Object.keys(current.derivatives).sort(), ["hero", "preview", "thumb"]);
  assert.equal(puts.length, 3);
  assert.equal(puts[0]?.contentType, "image/webp");
  assert.match(puts[0]?.cacheControl ?? "", /max-age=86400/);
  assert.equal(puts.some((put) => put.key.includes("/originals/")), false);
  assert.equal(current.derivatives.thumb, derivativeObjectKey("local", "asset1", "thumb"));

  await runMetaExif({ assetId: current.id, userId: current.userId }, { objects, assets });
  assert.equal(saved.exif?.hasGps, false);
  assert.equal(saved.exif?.format, "png");

  await assert.rejects(
    () =>
      runMediaDerivative(
        { assetId: current.id, userId: "other", storageKey: current.storageKey },
        { objects, assets },
      ),
    /asset_payload_mismatch/,
  );
});

test("final derivative failure records a redacted error and earlier attempts do not", async () => {
  const failures: string[] = [];
  const logs: string[] = [];
  const err = new Error(
    "GetObject http://127.0.0.1:9000/memora-local/k?X-Amz-Signature=supersecret password=memora-dev-change-me",
  );
  await onJobFailed({
    label: "media.derivative",
    assetId: "asset1",
    attemptsMade: 1,
    maxAttempts: 3,
    err,
    markFailed: async (_id, error) => {
      failures.push(error);
    },
    log: (line) => logs.push(line),
  });
  assert.equal(failures.length, 0);
  assert.equal(logs.some((line) => line.includes("supersecret")), false);
  assert.equal(logs.some((line) => line.includes("memora-dev-change-me")), false);

  await onJobFailed({
    label: "media.derivative",
    assetId: "asset1",
    attemptsMade: 3,
    maxAttempts: 3,
    err,
    markFailed: async (_id, error) => {
      failures.push(error);
    },
    log: (line) => logs.push(line),
  });
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.includes("supersecret"), false);
  assert.equal(failures[0]?.includes("memora-dev-change-me"), false);
  assert.match(failures[0] ?? "", /9000\/memora-local\/k\?\*\*\*/);
});
