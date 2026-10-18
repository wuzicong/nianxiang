import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "../auth/password.js";
import { sharePasswordMatches } from "./password.js";

test("share password match is false without a stored hash and true only for the same secret", async () => {
  const password = "share-secret-1";
  const encoded = await hashPassword(password);
  assert.equal(await sharePasswordMatches(password, encoded), true);
  assert.equal(await sharePasswordMatches("other-secret", encoded), false);
  assert.equal(await sharePasswordMatches(password, null), false);
  assert.equal(await sharePasswordMatches("memora-share-dummy-password", null), false);
  assert.equal(await sharePasswordMatches("", encoded), false);
  assert.equal(await sharePasswordMatches("x".repeat(200), null), false);
});
