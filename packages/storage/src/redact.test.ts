import assert from "node:assert/strict";
import test from "node:test";
import { redactSecrets, safeErrorMessage } from "./redact.js";

test("redactSecrets strips presigned queries and userinfo", () => {
  const raw =
    "GET http://127.0.0.1:9000/memora-local/users/u/originals/a?X-Amz-Signature=supersecret&X-Amz-Credential=memora/20260101/us-east-1/s3/aws4_request failed redis://:memora-dev-change-me@127.0.0.1:6379";
  const cleaned = redactSecrets(raw);
  assert.equal(cleaned.includes("supersecret"), false);
  assert.equal(cleaned.includes("memora-dev-change-me"), false);
  assert.match(cleaned, /http:\/\/127\.0\.0\.1:9000\/memora-local\/users\/u\/originals\/a\?\*\*\*/);
  assert.match(cleaned, /redis:\/\/:\*\*\*@127\.0\.0\.1:6379/);
});

test("redactSecrets masks access key ids and assigned secrets", () => {
  const accessKey = "AKIA" + "IOSFODNN7EXAMPLE";
  const cleaned = redactSecrets(
    `password=memora-dev-change-me key=${accessKey} token: abc`,
  );
  assert.equal(cleaned.includes("memora-dev-change-me"), false);
  assert.equal(cleaned.includes(accessKey), false);
  assert.match(cleaned, /password=\*\*\*/);
  assert.match(cleaned, /token: \*\*\*/);
});

test("redactSecrets masks session cookies, bearer tokens, and json passwords", () => {
  const session = `memora_session=${"a".repeat(43)}`;
  const bearer = "Authorization: Bearer eyJhbGciOiJub25lIn0.payload.sig";
  const cleaned = redactSecrets(
    `${session}; ${bearer} {"password":"secret-value","token":"raw-token"}`,
  );
  assert.equal(cleaned.includes("a".repeat(43)), false);
  assert.equal(cleaned.includes("eyJhbGciOiJub25lIn0"), false);
  assert.equal(cleaned.includes("secret-value"), false);
  assert.equal(cleaned.includes("raw-token"), false);
  assert.match(cleaned, /memora_session=\*\*\*/);
  assert.match(cleaned, /Bearer \*\*\*/);
  assert.match(cleaned, /"password":"\*\*\*/);
});

test("safeErrorMessage keeps ordinary failures", () => {
  assert.equal(safeErrorMessage(new Error("asset_not_found")), "asset_not_found");
  assert.equal(safeErrorMessage("plain"), "plain");
});
