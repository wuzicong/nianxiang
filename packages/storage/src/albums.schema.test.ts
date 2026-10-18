import assert from "node:assert/strict";
import test from "node:test";
import { THEME_IDS } from "@memora/shared";
import { ALBUM_SCHEMA_SQL } from "./schema.js";

test("share table stores token and password hashes, not plaintext secrets", () => {
  assert.match(ALBUM_SCHEMA_SQL, /token_hash TEXT NOT NULL/);
  assert.match(ALBUM_SCHEMA_SQL, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(ALBUM_SCHEMA_SQL, /password_hash TEXT/);
  assert.match(
    ALBUM_SCHEMA_SQL,
    /password_hash ~ '\^scrypt\\\$\[A-Za-z0-9_-\]\{22\}\\\$\[A-Za-z0-9_-\]\{43\}\$'/,
  );
  assert.match(ALBUM_SCHEMA_SQL, /ADD COLUMN IF NOT EXISTS password_hash TEXT/);
  assert.equal(/\btoken TEXT\b/i.test(ALBUM_SCHEMA_SQL), false);
  assert.equal(/\bpassword\s+TEXT\b/i.test(ALBUM_SCHEMA_SQL), false);
  assert.match(ALBUM_SCHEMA_SQL, /revoked_at TIMESTAMPTZ/);
  assert.match(ALBUM_SCHEMA_SQL, /expires_at TIMESTAMPTZ/);
  for (const id of THEME_IDS) {
    assert.match(ALBUM_SCHEMA_SQL, new RegExp(`'${id}'`));
  }
});
