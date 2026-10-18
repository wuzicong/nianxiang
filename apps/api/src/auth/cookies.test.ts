import assert from "node:assert/strict";
import test from "node:test";
import {
  hashSessionToken,
  newSessionToken,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "./cookies.js";

test("session token is opaque and only read from its own cookie", () => {
  const token = newSessionToken();
  assert.equal(token.length, 43);
  assert.equal(hashSessionToken(token).length, 64);
  const header = `theme=light; memora_session=${token}; other=1`;
  assert.equal(readSessionToken(header), token);
  assert.equal(readSessionToken(`memora_session=${"a".repeat(10)}`), null);
  assert.equal(readSessionToken("a".repeat(5000)), null);
  assert.equal(readSessionToken(undefined), null);
});

test("cookie serialization is HttpOnly and Secure only when asked", () => {
  const issued = serializeSessionCookie("a".repeat(43), { secure: false, maxAgeSeconds: 60 });
  assert.match(issued, /^memora_session=/);
  assert.match(issued, /HttpOnly/);
  assert.match(issued, /SameSite=Lax/);
  assert.match(issued, /Max-Age=60/);
  assert.equal(issued.includes("Secure"), false);

  const secure = serializeSessionCookie("a".repeat(43), { secure: true, maxAgeSeconds: 60 });
  assert.match(secure, /Secure/);

  const cleared = serializeClearedSessionCookie({ secure: true });
  assert.match(cleared, /memora_session=;/);
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/);
  assert.match(cleared, /Secure/);
  assert.equal(cleared.includes("a".repeat(43)), false);
});
