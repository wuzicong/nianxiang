import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { EmailTakenError, createAuthRepository } from "./auth.js";

const databaseUrl = process.env.MEMORA_AUTH_DATABASE_URL;

test("postgres auth roundtrip", async (t) => {
  if (!databaseUrl) {
    t.skip("set MEMORA_AUTH_DATABASE_URL to exercise the auth tables");
    return;
  }
  const auth = createAuthRepository({
    connectionString: databaseUrl,
    applicationName: "memora-auth-test",
  });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const email = `auth-${randomUUID()}@memora.test`;
  const userId = randomUUID();
  try {
    const user = await auth.insertUser({
      id: userId,
      email,
      passwordHash: "scrypt$integration$not-a-password",
    });
    assert.equal(user.email, email);
    await assert.rejects(
      () =>
        auth.insertUser({
          id: randomUUID(),
          email,
          passwordHash: "scrypt$integration$other",
        }),
      EmailTakenError,
    );
    const tokenHash = createHash("sha256").update(randomUUID()).digest("hex");
    await auth.insertSession({
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const active = await auth.findActiveSession(tokenHash);
    assert.equal(active?.userId, userId);
    assert.equal(active?.email, email);
    await auth.revokeSession(tokenHash);
    assert.equal(await auth.findActiveSession(tokenHash), null);
    const found = await auth.findUserByEmail(email);
    assert.equal(found?.passwordHash, "scrypt$integration$not-a-password");
  } finally {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => undefined);
    await pool.end();
    await auth.close();
  }
});
