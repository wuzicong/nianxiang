import assert from "node:assert/strict";
import test from "node:test";
import { JOB_NAMES } from "@memora/shared";
import {
  ASSET_JOB_ATTEMPTS,
  ASSET_JOB_BACKOFF_MS,
  assetJobOptions,
  bullJobId,
  isDuplicateJobError,
  redisConnectionOptions,
} from "./enqueue.js";

test("bull job id keeps the idempotency key without a colon", () => {
  const id = bullJobId("asset-1", JOB_NAMES.MEDIA_DERIVATIVE);
  assert.equal(id.includes(":"), false);
  assert.match(id, /asset-1/);
  assert.match(id, /media\.derivative/);
  assert.notEqual(
    bullJobId("asset-1", JOB_NAMES.MEDIA_DERIVATIVE),
    bullJobId("asset-1", JOB_NAMES.META_EXIF),
  );
});

test("asset jobs retry with backoff", () => {
  const options = assetJobOptions("asset-1__media.derivative");
  assert.equal(options.attempts, ASSET_JOB_ATTEMPTS);
  assert.equal(options.backoff.type, "exponential");
  assert.equal(options.backoff.delay, ASSET_JOB_BACKOFF_MS);
  assert.equal(ASSET_JOB_BACKOFF_MS, 2_000);
  assert.equal(options.jobId.includes(":"), false);
});

test("redis connection options split credentials from the host", () => {
  const secure = redisConnectionOptions("rediss://:s3cret@example.test:6380/2");
  assert.equal(secure.host, "example.test");
  assert.equal(secure.port, 6380);
  assert.equal(secure.password, "s3cret");
  assert.equal(secure.db, 2);
  assert.ok(secure.tls);
  const local = redisConnectionOptions("redis://127.0.0.1:6379");
  assert.equal(local.password, undefined);
  assert.equal(local.tls, undefined);
});

test("duplicate job ids are treated as success", () => {
  assert.equal(isDuplicateJobError(new Error("Job asset-1 already exists")), true);
  assert.equal(isDuplicateJobError({ name: "JobIdAlreadyExists", message: "" }), true);
  assert.equal(isDuplicateJobError(new Error("redis down")), false);
});
