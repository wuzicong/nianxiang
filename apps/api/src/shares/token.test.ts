import assert from "node:assert/strict";
import test from "node:test";
import { isShareToken } from "@memora/shared";
import { hashShareToken, newShareToken } from "./token.js";

test("share tokens are unguessable and only compared as hashes", () => {
  const token = newShareToken();
  const other = newShareToken();
  assert.equal(isShareToken(token), true);
  assert.equal(token.length, 43);
  assert.notEqual(token, other);
  const hash = hashShareToken(token);
  assert.equal(hash, hashShareToken(token));
  assert.notEqual(hash, hashShareToken(other));
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(token), false);
  assert.equal(isShareToken(hash), false);
});
