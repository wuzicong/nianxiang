import { isIP } from "node:net";
import type { IncrCounter } from "@memora/storage";

export interface ShareRateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface ShareRateLimiter {
  consume(scope: "read" | "unlock", clientKey: string, limit: number): Promise<ShareRateDecision>;
}

const WINDOW_SPLIT = "~";

/** 进程内固定窗口。key 自带窗口起点，过期窗口在表变大时丢掉。 */
export function createMemoryIncrCounter(now: () => number = Date.now): IncrCounter {
  const counts = new Map<string, number>();
  return {
    async incr(key) {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      if (counts.size > 4_000) {
        const t = now();
        for (const existing of counts.keys()) {
          const stamp = Number(existing.slice(existing.lastIndexOf(WINDOW_SPLIT) + 1));
          if (Number.isFinite(stamp) && stamp + 120_000 < t) counts.delete(existing);
        }
      }
      return count;
    },
    async close() {
      counts.clear();
    },
  };
}

/**
 * 公开分享的固定窗口。GET 和 unlock 用不同的 scope，但客户端键算法相同。
 * Redis 失败时改走 fallback，避免分享页因为计数器抖动变成 500。
 */
export function createShareRateLimiter(
  primary: IncrCounter,
  windowMs: number,
  options?: {
    fallback?: IncrCounter;
    now?: () => number;
    onError?: (err: unknown) => void;
  },
): ShareRateLimiter {
  const now = options?.now ?? (() => Date.now());
  const window = Number.isFinite(windowMs) && windowMs >= 1_000 ? Math.trunc(windowMs) : 60_000;
  return {
    async consume(scope, clientKey, limit) {
      const budget = Number.isFinite(limit) && limit >= 1 ? Math.trunc(limit) : 1;
      const t = now();
      const windowStart = Math.floor(t / window) * window;
      const key = `memora:share-rl${WINDOW_SPLIT}${scope}${WINDOW_SPLIT}${safeClient(clientKey)}${WINDOW_SPLIT}${windowStart}`;
      const ttl = Math.max(1, windowStart + window - t);
      let count: number;
      try {
        count = await primary.incr(key, ttl);
      } catch (err) {
        options?.onError?.(err);
        if (!options?.fallback) throw err;
        count = await options.fallback.incr(key, ttl);
      }
      return {
        allowed: count <= budget,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStart + window - t) / 1000)),
      };
    },
  };
}

export function clientKeyFromRequest(req: {
  socket?: { remoteAddress?: string | null };
  header(name: string): string | undefined;
}): string {
  return clientKeyFromPeer(req.socket?.remoteAddress ?? undefined, req.header("x-forwarded-for"));
}

/**
 * 上一跳在内网或本机时，才采用 X-Forwarded-For 最右边的地址（自家反代追加的那一跳）。
 * 公网直连一律用 socket 地址，忽略调用方自己写的头，避免伪造来源分桶。
 */
export function clientKeyFromPeer(peer: string | undefined, forwardedFor: string | undefined): string {
  const normalizedPeer = peer ? normalizeIp(peer) : null;
  if (normalizedPeer && isTrustedPeer(normalizedPeer)) {
    const forwarded = rightmostIp(forwardedFor);
    if (forwarded) return forwarded;
  }
  return normalizedPeer ?? "unknown";
}

function safeClient(clientKey: string): string {
  return /^[a-z0-9.:]+$/.test(clientKey) ? clientKey : "unknown";
}

export function normalizeIp(value: string): string | null {
  let ip = value.trim();
  if (!ip || ip.length > 64) return null;
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  if (ip.toLowerCase().startsWith("::ffff:")) {
    const mapped = ip.slice(7);
    if (isIP(mapped) === 4) ip = mapped;
  }
  if (isIP(ip) === 0) return null;
  return ip.toLowerCase();
}

function rightmostIp(header: string | undefined): string | null {
  if (!header || header.length > 512 || /[\r\n]/.test(header)) return null;
  const parts = header.split(",");
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const ip = normalizeIp(parts[i] ?? "");
    if (ip) return ip;
  }
  return null;
}

function isTrustedPeer(ip: string): boolean {
  if (ip.includes(":")) return isIpv6Trusted(ip);
  return isIpv4Trusted(ip);
}

function isIpv4Trusted(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return a === 172 && b >= 16 && b <= 31;
}

function isIpv6Trusted(ip: string): boolean {
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  const head = ip.split(":")[0] ?? "";
  if (head.length !== 4) return false;
  const value = Number.parseInt(head, 16);
  if (!Number.isFinite(value)) return false;
  if (value >= 0xfc00 && value <= 0xfdff) return true;
  return value >= 0xfe80 && value <= 0xfebf;
}
