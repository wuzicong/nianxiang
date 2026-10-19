import assert from "node:assert/strict";
import test from "node:test";
import {
  ENV,
  createTestApp,
  fakeObjects,
  getJson,
  memoryAlbums,
  memoryAssets,
  postJson,
  registerSession,
  withServer,
} from "./test-app.js";

const UNAVAILABLE = { error: "share_unavailable", message: "无法打开分享" };
const LIMITED = { error: "rate_limited", message: "请稍后再试" };
const MISSING = { error: "share_not_found", message: "分享不存在" };

function captureLogs() {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return {
    lines,
    restore() {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

test("public share limits follow the client, not the token", async () => {
  const secret = "share-secret-1";
  const missing = "m".repeat(43);
  const clientA = { "x-forwarded-for": "198.51.100.1, 203.0.113.10" };
  const clientB = { "x-forwarded-for": "198.51.100.1, 203.0.113.11" };
  const clientC = { "x-forwarded-for": "203.0.113.12" };
  const logs = captureLogs();
  try {
    const assets = memoryAssets();
    const { app } = createTestApp({
      assets,
      albums: memoryAlbums(assets),
      objects: fakeObjects(),
      env: { ...ENV, SHARE_READ_LIMIT: "2", SHARE_UNLOCK_LIMIT: "2" },
    });
    await withServer(app, async (base) => {
      const owner = await registerSession(base, "rate-limit@memora.test");
      const album = await postJson(base, "/api/v1/albums", { title: "限流" }, owner.cookie);
      const albumId = (album.body as { album: { albumId: string } }).album.albumId;
      const opened = await postJson(base, `/api/v1/albums/${albumId}/shares`, {}, owner.cookie);
      const openToken = (opened.body as { share: { token: string } }).share.token;
      const locked = await postJson(
        base,
        `/api/v1/albums/${albumId}/shares`,
        { password: secret },
        owner.cookie,
      );
      const lockedToken = (locked.body as { share: { token: string } }).share.token;

      const wrong = await postJson(
        base,
        `/api/v1/public/shares/${lockedToken}/unlock`,
        { password: "not-the-share-password" },
        undefined,
        clientA,
      );
      const wrongAgain = await postJson(
        base,
        `/api/v1/public/shares/${lockedToken}/unlock`,
        { password: "not-the-share-password" },
        undefined,
        clientA,
      );
      const missingWhileLimited = await postJson(
        base,
        `/api/v1/public/shares/${missing}/unlock`,
        { password: secret },
        undefined,
        clientA,
      );
      const realWhileLimited = await postJson(
        base,
        `/api/v1/public/shares/${lockedToken}/unlock`,
        { password: secret },
        undefined,
        clientA,
      );
      assert.equal(wrong.status, 401);
      assert.deepEqual(wrong.body, UNAVAILABLE);
      assert.equal(wrongAgain.status, 401);
      assert.deepEqual(wrongAgain.body, wrong.body);
      assert.equal(missingWhileLimited.status, 429);
      assert.deepEqual(missingWhileLimited.body, LIMITED);
      assert.equal(missingWhileLimited.cacheControl, "private, no-store");
      assert.match(missingWhileLimited.retryAfter ?? "", /^[1-9]\d*$/);
      assert.deepEqual(realWhileLimited.body, missingWhileLimited.body);
      assert.equal(realWhileLimited.status, 429);
      assert.equal(JSON.stringify(realWhileLimited.body).includes(secret), false);
      assert.equal(JSON.stringify(realWhileLimited.body).includes(lockedToken), false);

      const otherMissing = await postJson(
        base,
        `/api/v1/public/shares/${missing}/unlock`,
        { password: "not-the-share-password" },
        undefined,
        clientB,
      );
      assert.equal(otherMissing.status, 401);
      assert.deepEqual(otherMissing.body, UNAVAILABLE);

      const readWhileUnlockLimited = await getJson(
        base,
        `/api/v1/public/shares/${openToken}`,
        undefined,
        clientA,
      );
      assert.equal(readWhileUnlockLimited.status, 200);

      const ghost = await getJson(base, `/api/v1/public/shares/${missing}`, undefined, clientC);
      const ghostAgain = await getJson(base, `/api/v1/public/shares/${missing}`, undefined, clientC);
      const realRead = await getJson(base, `/api/v1/public/shares/${openToken}`, undefined, clientC);
      const ghostAfter = await getJson(base, `/api/v1/public/shares/${missing}`, undefined, clientC);
      assert.equal(ghost.status, 404);
      assert.deepEqual(ghost.body, MISSING);
      assert.equal(ghostAgain.status, 404);
      assert.equal(realRead.status, 429);
      assert.deepEqual(realRead.body, LIMITED);
      assert.equal(ghostAfter.status, 429);
      assert.deepEqual(ghostAfter.body, realRead.body);
      assert.equal(JSON.stringify(realRead.body).includes("限流"), false);

      const malformed = await postJson(
        base,
        "/api/v1/public/shares/not-a-token/unlock",
        { password: secret },
        undefined,
        clientB,
      );
      const malformedAgain = await postJson(
        base,
        "/api/v1/public/shares/not-a-token/unlock",
        { password: secret },
        undefined,
        clientB,
      );
      const wellFormedAfterMalformed = await postJson(
        base,
        `/api/v1/public/shares/${missing}/unlock`,
        { password: secret },
        undefined,
        clientB,
      );
      assert.equal(malformed.status, 404);
      assert.equal(malformedAgain.status, 429);
      assert.deepEqual(malformedAgain.body, LIMITED);
      assert.equal(wellFormedAfterMalformed.status, 429);
      assert.deepEqual(wellFormedAfterMalformed.body, malformedAgain.body);

      const text = logs.lines.join("\n");
      assert.equal(text.includes(secret), false);
      assert.equal(text.includes(openToken), false);
      assert.equal(text.includes(lockedToken), false);
      assert.equal(text.includes("not-the-share-password"), false);
      assert.match(text, /share rate-limited scope=unlock/);
      assert.match(text, /share rate-limited scope=read/);
    });
  } finally {
    logs.restore();
  }
});
