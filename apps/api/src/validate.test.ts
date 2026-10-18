import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "./http.js";
import { readTraceId, validateUploadRequest } from "./validate.js";

const MAX = 1024;

function valid(overrides: Record<string, unknown> = {}) {
  return validateUploadRequest({
    filename: "trip.jpg",
    mime: "image/jpeg",
    size: 100,
    userId: "local",
    maxBytes: MAX,
    ...overrides,
  });
}

test("accepts a normalized image upload", () => {
  const parsed = valid({ mime: "IMAGE/PNG; charset=binary", filename: "  a.png  " });
  assert.equal(parsed.contentType, "image/png");
  assert.equal(parsed.filename, "a.png");
  assert.equal(parsed.userId, "local");
});

test("rejects missing fields, svg, traversal, and oversized payloads", () => {
  assert.throws(() => valid({ size: "100" }), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.code, "invalid_request");
    return true;
  });
  assert.throws(() => valid({ mime: "image/svg+xml" }), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.code, "unsupported_media_type");
    return true;
  });
  assert.throws(() => valid({ userId: "../admin" }), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.code, "invalid_user");
    return true;
  });
  assert.throws(() => valid({ filename: "a/b.jpg" }), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.code, "invalid_filename");
    return true;
  });
  assert.throws(() => valid({ size: MAX + 1 }), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.code, "payload_too_large");
    return true;
  });
});

test("trace id is optional and bounded", () => {
  assert.equal(readTraceId(undefined), undefined);
  assert.equal(readTraceId("req_1"), "req_1");
  assert.equal(readTraceId("bad id"), undefined);
  assert.equal(readTraceId("x".repeat(65)), undefined);
});
