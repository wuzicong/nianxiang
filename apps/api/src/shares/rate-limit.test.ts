import assert from "node:assert/strict";
import test from "node:test";
import type { IncrCounter } from "@memora/storage";
import {
  clientKeyFromPeer,
  createMemoryIncrCounter,
  createShareRateLimiter,
} from "./rate-limit.js";

test("client key trusts the rightmost forwarded address only from a private peer", () => {
  assert.equal(clientKeyFromPeer("8.8.8.8", "203.0.113.10"), "8.8.8.8");
  assert.equal(clientKeyFromPeer("203.0.113.8", "1.2.3.4, 203.0.113.10"), "203.0.113.8");
  assert.equal(clientKeyFromPeer("127.0.0.1", "198.51.100.1, 203.0.113.10"), "203.0.113.10");
  assert.equal(clientKeyFromPeer("::ffff:10.0.0.8", "203.0.113.11"), "203.0.113.11");
  assert.equal(clientKeyFromPeer("127.0.0.1", "not-an-ip"), "127.0.0.1");
  assert.equal(clientKeyFromPeer("127.0.0.1", "203.0.113.10\n10.0.0.1"), "127.0.0.1");
  assert.equal(clientKeyFromPeer(undefined, "203.0.113.10"), "unknown");
  assert.equal(clientKeyFromPeer("::1", "203.0.113.12"), "203.0.113.12");
});

test("read and unlock windows are separate and reset with the clock", async () => {
  let now = 1_000;
  const clock = () => now;
  const limiter = createShareRateLimiter(createMemoryIncrCounter(clock), 60_000, { now: clock });
  assert.equal((await limiter.consume("unlock", "203.0.113.10", 2)).allowed, true);
  assert.equal((await limiter.consume("unlock", "203.0.113.10", 2)).allowed, true);
  const blocked = await limiter.consume("unlock", "203.0.113.10", 2);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds >= 1, true);
  assert.equal((await limiter.consume("unlock", "203.0.113.11", 2)).allowed, true);
  assert.equal((await limiter.consume("read", "203.0.113.10", 2)).allowed, true);
  now += 60_000;
  assert.equal((await limiter.consume("unlock", "203.0.113.10", 2)).allowed, true);
});

test("redis errors fall back to memory instead of failing the request", async () => {
  const fallback = createMemoryIncrCounter();
  const primary: IncrCounter = {
    async incr() {
      throw new Error("redis down");
    },
    async close() {},
  };
  const errors: unknown[] = [];
  const limiter = createShareRateLimiter(primary, 60_000, {
    fallback,
    onError(err) {
      errors.push(err);
    },
  });
  assert.equal((await limiter.consume("unlock", "203.0.113.10", 1)).allowed, true);
  assert.equal((await limiter.consume("unlock", "203.0.113.10", 1)).allowed, false);
  assert.equal(errors.length, 2);
});
