import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig } from "./runtime-config.js";

test("S3_PUBLIC_ENDPOINT is optional and blank means unset", () => {
  const absent = loadRuntimeConfig({});
  assert.equal(absent.s3.publicEndpoint, undefined);
  assert.equal(absent.s3.endpoint, "http://127.0.0.1:9000");

  const blank = loadRuntimeConfig({ S3_PUBLIC_ENDPOINT: "   " });
  assert.equal(blank.s3.publicEndpoint, undefined);

  const set = loadRuntimeConfig({ S3_PUBLIC_ENDPOINT: " http://127.0.0.1:9000/ " });
  assert.equal(set.s3.publicEndpoint, "http://127.0.0.1:9000/");
  assert.equal(set.s3.endpoint, "http://127.0.0.1:9000");
});
