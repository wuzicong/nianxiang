import assert from "node:assert/strict";
import test from "node:test";
import {
  SHARE_RATE_LIMIT_BODY,
  SHARE_RATE_LIMIT_TITLE,
  UNLOCK_FAILED,
  UNLOCK_RATE_LIMIT,
  classifyPublicShare,
  loadPublicShareFrom,
} from "../src/lib/share-load";
import { forcedPublicShareStatus } from "../src/lib/share-status-hook";

const knownThemes = new Set(["cotton-candy", "kyoto-lantern", "magazine-heirloom"]);

function isThemeId(value: string): boolean {
  return knownThemes.has(value);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("公开分享 429 是限流，不是不存在", async () => {
  const loaded = await classifyPublicShare(
    429,
    async () => ({ error: "share_not_found", message: "分享不存在" }),
    isThemeId,
  );
  assert.equal(loaded.kind, "limited");
  assert.equal(SHARE_RATE_LIMIT_TITLE, "请求太频繁");
  assert.match(SHARE_RATE_LIMIT_BODY, /请稍后再试/);
  for (const banned of ["分享不存在", "链接无效", "无法打开分享", "相册不存在"]) {
    assert.equal(SHARE_RATE_LIMIT_TITLE.includes(banned), false);
    assert.equal(SHARE_RATE_LIMIT_BODY.includes(banned), false);
  }
});

test("404 仍是不存在，401 需要密码仍是锁定，错密码文案不变", async () => {
  const missing = await classifyPublicShare(404, async () => ({ error: "share_not_found" }), isThemeId);
  assert.equal(missing.kind, "missing");
  const locked = await classifyPublicShare(
    401,
    async () => ({ error: "password_required", themeId: "kyoto-lantern" }),
    isThemeId,
  );
  assert.deepEqual(locked, { kind: "locked", themeId: "kyoto-lantern" });
  const other = await classifyPublicShare(401, async () => ({ error: "share_unavailable" }), isThemeId);
  assert.equal(other.kind, "missing");
  assert.equal(UNLOCK_FAILED, "无法打开分享。请确认密码；链接撤销或过期时也是这句话。");
  assert.equal(UNLOCK_RATE_LIMIT.includes("无法打开分享"), false);
  assert.match(UNLOCK_RATE_LIMIT, /每分钟 6 次/);
  assert.match(UNLOCK_RATE_LIMIT, /不要连续点击/);
});

test("上游 429 收成 limited，冒烟 forceStatus 走同一分类", async () => {
  let calls = 0;
  const limited = await loadPublicShareFrom({
    tokenOk: true,
    isThemeId,
    fetchShare: async () => {
      calls += 1;
      return jsonResponse(429, { message: "请稍后再试" });
    },
  });
  assert.equal(limited.kind, "limited");
  assert.equal(calls, 1);

  const forced = await loadPublicShareFrom({
    tokenOk: true,
    forceStatus: forcedPublicShareStatus("429", { NODE_ENV: "development" }),
    isThemeId,
    fetchShare: async () => {
      calls += 1;
      return jsonResponse(404, { error: "share_not_found" });
    },
  });
  assert.equal(forced.kind, "limited");
  assert.equal(calls, 1);

  const upstreamMissing = await loadPublicShareFrom({
    tokenOk: true,
    isThemeId,
    fetchShare: async () => jsonResponse(404, { error: "share_not_found" }),
  });
  assert.equal(upstreamMissing.kind, "missing");
  assert.equal(forcedPublicShareStatus("429", { NODE_ENV: "production" }), undefined);
  assert.equal(forcedPublicShareStatus("429", { NODE_ENV: "production", MEMORA_SHARE_STATUS_HOOK: "1" }), 429);
  assert.equal(forcedPublicShareStatus("500", { NODE_ENV: "development" }), undefined);
});
