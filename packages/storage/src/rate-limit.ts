import { Redis } from "ioredis";
import { redisConnectionOptions } from "./enqueue.js";

/**
 * 固定窗口计数。INCR 和 PEXPIRE 在同一条 Lua 里，避免计数成功但键永不失效。
 * 调用方把窗口起点放进 key，这里只负责加一和过期。
 */
const INCR_WITH_TTL = `
local n = redis.call("INCR", KEYS[1])
if n == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return n
`;

export interface IncrCounter {
  incr(key: string, ttlMs: number): Promise<number>;
  close(): Promise<void>;
}

export interface RedisEvalClient {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
  quit(): Promise<unknown>;
}

export function createRedisIncrCounter(redisUrl: string, client?: RedisEvalClient): IncrCounter {
  const redis =
    client ??
    new Redis({
      ...redisConnectionOptions(redisUrl),
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      commandTimeout: 500,
      enableOfflineQueue: false,
    });
  return {
    async incr(key, ttlMs) {
      const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? Math.trunc(ttlMs) : 1_000;
      const value = await redis.eval(INCR_WITH_TTL, 1, key, String(ttl));
      const count = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(count)) throw new Error("rate_limit_counter_invalid");
      return count;
    },
    async close() {
      await redis.quit();
    },
  };
}
