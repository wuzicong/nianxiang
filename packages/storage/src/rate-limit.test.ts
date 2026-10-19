import assert from "node:assert/strict";
import test from "node:test";
import { createRedisIncrCounter, type RedisEvalClient } from "./rate-limit.js";

test("redis counter increments with a ttl and does not open a connection when injected", async () => {
  const calls: Array<{ numKeys: number; key: string; ttl: string }> = [];
  let n = 0;
  const client: RedisEvalClient = {
    async eval(_script, numKeys, key, ttl) {
      calls.push({ numKeys, key, ttl });
      assert.match(_script, /INCR/);
      assert.match(_script, /PEXPIRE/);
      n += 1;
      return n;
    },
    async quit() {
      return "OK";
    },
  };
  const counter = createRedisIncrCounter("redis://127.0.0.1:6379", client);
  assert.equal(await counter.incr("memora:share-rl~unlock~203.0.113.10~1000", 1500), 1);
  assert.equal(await counter.incr("memora:share-rl~unlock~203.0.113.10~1000", 1500), 2);
  assert.deepEqual(calls[0], {
    numKeys: 1,
    key: "memora:share-rl~unlock~203.0.113.10~1000",
    ttl: "1500",
  });
  await counter.close();
});
