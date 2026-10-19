import assert from "node:assert/strict";
import test from "node:test";
import { applyProxyResponseHeaders } from "../src/lib/api-proxy";

test("api proxy keeps rate-limit headers and does not copy set-cookie by itself", () => {
  const upstream = new Headers({
    "content-type": "application/json",
    "cache-control": "private, no-store",
    "retry-after": "17",
    "x-robots-tag": "noindex",
    "referrer-policy": "no-referrer",
    "set-cookie": "memora_session=secret",
  });
  const target = new Headers();
  applyProxyResponseHeaders(target, upstream);
  assert.equal(target.get("retry-after"), "17");
  assert.equal(target.get("cache-control"), "private, no-store");
  assert.equal(target.get("x-robots-tag"), "noindex");
  assert.equal(target.get("referrer-policy"), "no-referrer");
  assert.equal(target.get("set-cookie"), null);
});
