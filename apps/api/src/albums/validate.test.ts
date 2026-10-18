import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../http.js";
import {
  parseAlbumTitle,
  parseAssetIds,
  parseExpiresAt,
  parseSharePassword,
  parseThemeId,
} from "./validate.js";

const NOW = Date.parse("2026-10-18T00:00:00.000Z");

test("album validators accept a title, theme, assets, and future expiry", () => {
  assert.equal(parseAlbumTitle("  京都 "), "京都");
  assert.equal(parseThemeId(undefined), "cotton-candy");
  assert.equal(parseThemeId("kyoto-lantern"), "kyoto-lantern");
  assert.deepEqual(parseAssetIds(["asset_1", "asset_1", "asset-2"]), ["asset_1", "asset-2"]);
  const expires = parseExpiresAt("2026-10-19T00:00:00.000Z", NOW);
  assert.equal(expires?.toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(parseExpiresAt(null, NOW), null);
  assert.equal(parseExpiresAt(undefined, NOW), null);
});

test("album validators reject empty titles, unknown themes, and bad expiry", () => {
  assert.throws(() => parseAlbumTitle("   "), (err) => err instanceof HttpError && err.status === 400);
  assert.throws(() => parseAlbumTitle("a".repeat(81)), HttpError);
  assert.throws(() => parseThemeId("cotton"), (err) => err instanceof HttpError && err.code === "invalid_theme");
  assert.throws(() => parseThemeId(null), HttpError);
  assert.throws(() => parseAssetIds([]), HttpError);
  assert.throws(() => parseAssetIds(["../x"]), HttpError);
  assert.throws(() => parseAssetIds(Array.from({ length: 51 }, (_, i) => `asset${i}`)), HttpError);
  assert.throws(
    () => parseExpiresAt("2026-10-17T00:00:00.000Z", NOW),
    (err) => err instanceof HttpError && err.status === 400,
  );
  assert.throws(() => parseExpiresAt("2028-01-01T00:00:00.000Z", NOW), HttpError);
  assert.throws(() => parseExpiresAt(123, NOW), HttpError);
});

test("share password is optional unless the deployment requires one", () => {
  assert.equal(parseSharePassword(undefined, false), null);
  assert.equal(parseSharePassword(null, false), null);
  assert.equal(parseSharePassword("  12345678", false), "  12345678");
  assert.equal(parseSharePassword("share-secret-1", true), "share-secret-1");
  assert.throws(
    () => parseSharePassword(undefined, true),
    (err) => err instanceof HttpError && err.code === "password_required",
  );
  assert.throws(
    () => parseSharePassword("", false),
    (err) => err instanceof HttpError && err.code === "weak_password",
  );
  assert.throws(() => parseSharePassword("short", false), HttpError);
  assert.throws(() => parseSharePassword(`secret\npassword`, false), HttpError);
  assert.throws(() => parseSharePassword("x".repeat(129), false), HttpError);
});
