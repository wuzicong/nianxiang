import assert from "node:assert/strict";
import test from "node:test";
import { createObjectStore, type ObjectStoreConfig } from "./object-store.js";

const SECRET = "test-secret-value";

function baseConfig(overrides: Partial<ObjectStoreConfig> = {}): ObjectStoreConfig {
  return {
    endpoint: "http://127.0.0.1:9000",
    region: "us-east-1",
    bucket: "memora-local",
    accessKeyId: "memora",
    secretAccessKey: SECRET,
    forcePathStyle: true,
    presignTtlSeconds: 600,
    ...overrides,
  };
}

test("presignPut returns a path-style URL clamped to the requested TTL", async () => {
  const store = createObjectStore(baseConfig());
  const signed = await store.presignPut({
    key: "users/local/originals/asset-1",
    contentType: "image/png",
    contentLength: 128,
  });
  const url = new URL(signed.url);
  assert.equal(url.origin, "http://127.0.0.1:9000");
  assert.equal(url.pathname, "/memora-local/users/local/originals/asset-1");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(signed.url.includes(SECRET), false);
  assert.equal(signed.headers["Content-Type"], "image/png");
  assert.equal(signed.headers["Content-Length"], "128");
  const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders") ?? "";
  assert.match(signedHeaders, /content-length/);
  assert.equal(signedHeaders.includes("content-type"), false);
  assert.equal(signedHeaders.includes("checksum"), false);
  const drift = Math.abs(signed.expiresAt.getTime() - (Date.now() + 600_000));
  assert.ok(drift < 5_000);
});

test("presignPut adds KMS headers only when a key is configured", async () => {
  const plain = await createObjectStore(baseConfig()).presignPut({
    key: "users/local/originals/asset-1",
    contentType: "image/jpeg",
    contentLength: 10,
  });
  assert.equal(plain.headers["x-amz-server-side-encryption"], undefined);

  const kms = await createObjectStore(
    baseConfig({ kmsKeyId: "arn:aws:kms:ap-southeast-1:123456789012:key/example" }),
  ).presignPut({
    key: "users/local/originals/asset-1",
    contentType: "image/jpeg",
    contentLength: 10,
  });
  assert.equal(kms.headers["x-amz-server-side-encryption"], "aws:kms");
  assert.match(kms.headers["x-amz-server-side-encryption-aws-kms-key-id"] ?? "", /example$/);
  const signedHeaders = new URL(kms.url).searchParams.get("X-Amz-SignedHeaders") ?? "";
  assert.match(signedHeaders, /x-amz-server-side-encryption/);
});

test("presignGet signs a single derivative key for the same TTL", async () => {
  const store = createObjectStore(baseConfig());
  const signed = await store.presignGet({
    key: "users/local/derivatives/asset-1/preview.webp",
  });
  const url = new URL(signed.url);
  assert.equal(url.pathname, "/memora-local/users/local/derivatives/asset-1/preview.webp");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
  assert.equal(signed.url.includes(SECRET), false);
  assert.equal(signed.url.includes("/originals/"), false);
  const drift = Math.abs(signed.expiresAt.getTime() - (Date.now() + 600_000));
  assert.ok(drift < 5_000);
});

test("presign URLs use the public endpoint while the key stays a derivative", async () => {
  const store = createObjectStore(
    baseConfig({
      endpoint: "http://minio:9000",
      publicEndpoint: "http://127.0.0.1:9000/",
    }),
  );
  const signed = await store.presignGet({
    key: "users/local/derivatives/asset-1/preview.webp",
  });
  const url = new URL(signed.url);
  assert.equal(url.origin, "http://127.0.0.1:9000");
  assert.equal(url.pathname, "/memora-local/users/local/derivatives/asset-1/preview.webp");
  assert.equal(signed.url.includes("minio"), false);
  assert.equal(signed.url.includes("/originals/"), false);
  assert.equal(signed.url.includes(SECRET), false);
});

test("public endpoint rejects credentials and paths", () => {
  assert.throws(() =>
    createObjectStore(baseConfig({ publicEndpoint: "http://memora:secret@127.0.0.1:9000" })),
  );
  assert.throws(() =>
    createObjectStore(baseConfig({ publicEndpoint: "http://127.0.0.1:9000/memora-local" })),
  );
  assert.throws(() => createObjectStore(baseConfig({ publicEndpoint: "not-a-url" })));
});

test("presign TTL outside 5–15 minutes is rejected", () => {
  assert.throws(() => createObjectStore(baseConfig({ presignTtlSeconds: 60 })));
  assert.throws(() => createObjectStore(baseConfig({ presignTtlSeconds: 3_600 })));
});
