import assert from "node:assert/strict";
import test from "node:test";
import { originalObjectKey } from "@memora/shared";
import { HttpError } from "./http.js";
import { hashSessionToken } from "./auth/cookies.js";
import { beginOidcSession } from "./auth/oidc.js";
import { createConfig } from "./config.js";
import {
  ENV,
  TEST_PASSWORD,
  createTestApp,
  fakeJobs,
  fakeObjects,
  getJson,
  memoryAssets,
  postJson,
  record,
  registerSession,
  withServer,
} from "./test-app.js";

test("anonymous upload, complete, and read are 401", async () => {
  const assets = memoryAssets([
    record({ id: "asset1", userId: "owner-user", status: "ready" }),
  ]);
  const objects = fakeObjects();
  const { app } = createTestApp({ assets, objects, jobs: fakeJobs() });
  await withServer(app, async (base) => {
    const upload = await postJson(base, "/api/v1/assets/upload-url", {
      filename: "trip.jpg",
      mime: "image/jpeg",
      size: 100,
      userId: "owner-user",
    });
    assert.equal(upload.status, 401);
    assert.equal((upload.body as { error: string }).error, "unauthenticated");
    assert.equal(objects.presigns.length, 0);
    assert.equal(assets.rows.size, 1);

    const complete = await postJson(base, "/api/v1/assets/asset1/complete", {});
    assert.equal(complete.status, 401);
    const read = await getJson(base, "/api/v1/assets/asset1");
    assert.equal(read.status, 401);
    const me = await getJson(base, "/api/v1/auth/me");
    assert.equal(me.status, 401);
  });
});

test("login session can upload, and another user gets 404", async () => {
  const assets = memoryAssets();
  const objects = fakeObjects();
  const jobs = fakeJobs();
  const { app } = createTestApp({ assets, objects, jobs });
  await withServer(app, async (base) => {
    const owner = await registerSession(base, "owner@memora.test");
    const other = await registerSession(base, "other@memora.test");
    assert.equal(owner.setCookie.includes("HttpOnly"), true);
    assert.equal(owner.setCookie.includes("SameSite=Lax"), true);
    assert.equal(owner.setCookie.includes("Secure"), false);
    assert.equal(JSON.stringify(owner.body).includes(TEST_PASSWORD), false);
    assert.equal(JSON.stringify(owner.body).includes("passwordHash"), false);

    const uploaded = await postJson(
      base,
      "/api/v1/assets/upload-url",
      { filename: "trip.jpg", mime: "image/jpeg", size: 100, userId: other.user.id },
      owner.cookie,
    );
    assert.equal(uploaded.status, 201);
    const body = uploaded.body as { assetId: string; key: string };
    assert.equal(body.key, originalObjectKey(owner.user.id, body.assetId));
    assert.equal(body.key.includes(other.user.id), false);

    const foreignComplete = await postJson(
      base,
      `/api/v1/assets/${body.assetId}/complete`,
      {},
      other.cookie,
    );
    assert.equal(foreignComplete.status, 404);
    assert.equal((foreignComplete.body as { error: string }).error, "asset_not_found");
    assert.equal(objects.heads.length, 0);
    assert.equal(jobs.calls.length, 0);

    const foreignRead = await getJson(base, `/api/v1/assets/${body.assetId}`, other.cookie);
    assert.equal(foreignRead.status, 404);
    assert.equal(JSON.stringify(foreignRead.body).includes(body.key), false);

    const ownRead = await getJson(base, `/api/v1/assets/${body.assetId}`, owner.cookie);
    assert.equal(ownRead.status, 200);
    assert.equal((ownRead.body as { userId: string }).userId, owner.user.id);

    const missing = await getJson(base, "/api/v1/assets/missing-asset", owner.cookie);
    assert.equal(missing.status, 404);
    assert.equal((missing.body as { error: string }).error, "asset_not_found");
  });
});

test("logout revokes the session cookie", async () => {
  const { app } = createTestApp();
  await withServer(app, async (base) => {
    const session = await registerSession(base, "bye@memora.test");
    const me = await getJson(base, "/api/v1/auth/me", session.cookie);
    assert.equal(me.status, 200);
    assert.equal((me.body as { user: { email: string } }).user.email, "bye@memora.test");

    const loggedOut = await postJson(base, "/api/v1/auth/logout", {}, session.cookie);
    assert.equal(loggedOut.status, 204);
    assert.match(loggedOut.setCookies.join(";"), /memora_session=;/);
    assert.match(loggedOut.setCookies.join(";"), /Max-Age=0/);

    const again = await postJson(
      base,
      "/api/v1/assets/upload-url",
      { filename: "trip.jpg", mime: "image/jpeg", size: 100 },
      session.cookie,
    );
    assert.equal(again.status, 401);
  });
});

test("login accepts the same email and rejects unknown or wrong passwords the same way", async () => {
  const { app } = createTestApp();
  await withServer(app, async (base) => {
    await registerSession(base, "Ada@Memora.test");
    const loggedIn = await postJson(base, "/api/v1/auth/login", {
      email: "ada@memora.test",
      password: TEST_PASSWORD,
    });
    assert.equal(loggedIn.status, 200);
    assert.equal((loggedIn.body as { user: { email: string } }).user.email, "ada@memora.test");
    assert.equal(loggedIn.setCookies[0]?.includes("HttpOnly"), true);

    const wrong = await postJson(base, "/api/v1/auth/login", {
      email: "ada@memora.test",
      password: "not-the-password",
    });
    const missing = await postJson(base, "/api/v1/auth/login", {
      email: "missing@memora.test",
      password: "not-the-password",
    });
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.equal((wrong.body as { error: string }).error, "invalid_credentials");
    assert.deepEqual(wrong.body, missing.body);
    assert.equal(JSON.stringify(wrong.body).includes(TEST_PASSWORD), false);

    const weak = await postJson(base, "/api/v1/auth/register", {
      email: "new@memora.test",
      password: "short",
    });
    assert.equal(weak.status, 400);
    assert.equal((weak.body as { error: string }).error, "weak_password");

    const taken = await postJson(base, "/api/v1/auth/register", {
      email: "ada@memora.test",
      password: TEST_PASSWORD,
    });
    assert.equal(taken.status, 409);
    assert.equal((taken.body as { error: string }).error, "email_taken");
  });
});

test("cloud sessions set Secure cookies and closed registration stays closed", async () => {
  const { app } = createTestApp({
    env: { ...ENV, DEPLOY_MODE: "cloud", AUTH_REGISTRATION: "closed" },
  });
  await withServer(app, async (base) => {
    const closed = await postJson(base, "/api/v1/auth/register", {
      email: "cloud@memora.test",
      password: TEST_PASSWORD,
    });
    assert.equal(closed.status, 403);
    assert.equal((closed.body as { error: string }).error, "registration_closed");
  });

  const open = createTestApp({ env: { ...ENV, DEPLOY_MODE: "cloud" } });
  await withServer(open.app, async (base) => {
    const session = await registerSession(base, "cloud@memora.test");
    assert.equal(session.setCookie.includes("Secure"), true);
    assert.equal(session.setCookie.includes("HttpOnly"), true);
  });
});

test("expired or revoked session cookies are rejected", async () => {
  const { app, auth } = createTestApp();
  const token = "c".repeat(43);
  await auth.insertUser({
    id: "user-expired00",
    email: "expired@memora.test",
    passwordHash: "scrypt$aaaaaaaa$bbbbbbbb",
  });
  await auth.insertSession({
    tokenHash: hashSessionToken(token),
    userId: "user-expired00",
    expiresAt: new Date(Date.now() - 60_000),
  });
  await withServer(app, async (base) => {
    const expired = await getJson(base, "/api/v1/auth/me", `memora_session=${token}`);
    assert.equal(expired.status, 401);

    const live = "d".repeat(43);
    await auth.insertSession({
      tokenHash: hashSessionToken(live),
      userId: "user-expired00",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const before = await getJson(base, "/api/v1/auth/me", `memora_session=${live}`);
    assert.equal(before.status, 200);
    await auth.revokeSession(hashSessionToken(live));
    const after = await getJson(base, "/api/v1/auth/me", `memora_session=${live}`);
    assert.equal(after.status, 401);
  });
});

test("oidc routes stay disabled and do not echo a posted token", async () => {
  assert.throws(
    () =>
      beginOidcSession({
        issuer: "https://idp.example",
        subject: "subject",
        email: "a@memora.test",
      }),
    (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.code, "oidc_not_enabled");
      return true;
    },
  );

  const planted = "oidc-token-should-not-leak-9f3a";
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const { app } = createTestApp({
      env: { ...ENV, OIDC_ISSUER: "https://idp.example", OIDC_CLIENT_SECRET: planted },
    });
    assert.equal(createConfig({ ...ENV, OIDC_CLIENT_SECRET: planted }).oidcConfigured, true);
    await withServer(app, async (base) => {
      const started = await postJson(base, "/api/v1/auth/oidc/start", { code: planted });
      const callback = await postJson(base, "/api/v1/auth/oidc/callback", {
        id_token: planted,
      });
      assert.equal(started.status, 501);
      assert.equal((started.body as { error: string }).error, "oidc_not_enabled");
      assert.equal(callback.status, 501);
      assert.equal(JSON.stringify(callback.body).includes(planted), false);
      assert.equal(logs.some((line) => line.includes(planted)), false);
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("browser origin is echoed only when it is configured", async () => {
  const { app } = createTestApp();
  await withServer(app, async (base) => {
    const allowed = await fetch(`${base}/api/v1/auth/me`, {
      headers: { origin: "http://127.0.0.1:3000" },
    });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://127.0.0.1:3000");
    assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

    const blocked = await fetch(`${base}/api/v1/auth/me`, {
      headers: { origin: "http://evil.example" },
    });
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  });
});
