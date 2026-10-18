import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, isAcceptablePassword, verifyPassword } from "./password.js";

test("scrypt hash verifies the same password and rejects a different one", async () => {
  const password = "correct-horse";
  const encoded = await hashPassword(password);
  assert.match(encoded, /^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.equal(encoded.includes(password), false);
  const again = await hashPassword(password);
  assert.notEqual(encoded, again);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("other-password", encoded), false);
  assert.equal(await verifyPassword(password, "not-a-hash"), false);
  assert.equal(await verifyPassword(password, "scrypt$aa$bb"), false);
});

test("password length is bounded", () => {
  assert.equal(isAcceptablePassword("short"), false);
  assert.equal(isAcceptablePassword("12345678"), true);
  assert.equal(isAcceptablePassword("x".repeat(128)), true);
  assert.equal(isAcceptablePassword("x".repeat(129)), false);
  assert.equal(isAcceptablePassword(12345678), false);
});
