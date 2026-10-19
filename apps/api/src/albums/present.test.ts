import assert from "node:assert/strict";
import test from "node:test";
import { derivativeObjectKey, originalObjectKey } from "@memora/shared";
import type { PublicShareView } from "@memora/storage";
import { libraryTakenAt } from "../library/present.js";
import { presentPublicShare } from "./present.js";

function objects() {
  const presignGets: string[] = [];
  return {
    presignGets,
    async presignGet(input: { key: string }) {
      presignGets.push(input.key);
      return {
        url: `http://127.0.0.1:9000/memora-local/${input.key}?X-Amz-Signature=supersecret`,
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
      };
    },
  };
}

function view(assets: PublicShareView["assets"]): PublicShareView {
  return {
    shareId: "share-1",
    albumId: "album-1",
    userId: "user-1",
    title: "海港",
    themeId: "kyoto-lantern",
    assets,
  };
}

test("presentPublicShare serializes a trusted takenAt and null when it is missing", async () => {
  const userId = "user-1";
  const datedId = "photo-dated";
  const plainId = "photo-plain";
  const isoId = "photo-iso";
  const preview = derivativeObjectKey(userId, datedId, "preview");
  const store = objects();
  const colon = "2024:05:12 08:00:00";
  const iso = "2020-01-02T03:04:05.000Z";
  const body = await presentPublicShare(
    view([
      {
        assetId: datedId,
        width: 640,
        height: 480,
        derivatives: { preview },
        capturedAt: colon,
      },
      {
        assetId: plainId,
        width: null,
        height: null,
        derivatives: {},
        capturedAt: null,
      },
      {
        assetId: isoId,
        width: 8,
        height: 8,
        derivatives: {},
        capturedAt: iso,
      },
    ]),
    store,
  );

  assert.equal(body.assets[0]?.takenAt, libraryTakenAt({ capturedAt: colon, hasGps: true, lat: 1 }));
  assert.equal(body.assets[0]?.takenAt, "2024-05-12T08:00:00");
  assert.equal(body.assets[1]?.takenAt, null);
  assert.equal(body.assets[2]?.takenAt, "2020-01-02T03:04:05.000Z");
  assert.deepEqual(Object.keys(body.assets[0] ?? {}).sort(), [
    "assetId",
    "derivatives",
    "filename",
    "height",
    "takenAt",
    "width",
  ]);
  assert.equal(body.assets[0]?.filename, "");
  assert.equal(body.album.title, "海港");
  assert.equal(body.album.themeId, "kyoto-lantern");
  const json = JSON.stringify(body);
  assert.equal(json.includes(colon), false);
  assert.equal(json.includes("capturedAt"), false);
  assert.equal(json.includes("hasGps"), false);
  assert.deepEqual(store.presignGets, [preview]);
});

test("presentPublicShare does not leak filenames, object keys, or exif", async () => {
  const userId = "user-1";
  const assetId = "photo-named";
  const original = originalObjectKey(userId, assetId);
  const preview = derivativeObjectKey(userId, assetId, "preview");
  const store = objects();
  const body = await presentPublicShare(
    view([
      {
        assetId,
        width: 10,
        height: 10,
        derivatives: { preview, hero: original },
        capturedAt: "12.3456,99.9",
      },
    ]),
    store,
  );
  const asset = body.assets[0];
  assert.ok(asset);
  assert.equal(asset.takenAt, null);
  assert.equal(asset.filename, "");
  assert.equal("exif" in asset, false);
  assert.equal("capturedAt" in asset, false);
  assert.equal("userId" in asset, false);
  assert.equal(asset.derivatives.hero, undefined);
  const json = JSON.stringify(body);
  assert.equal(json.includes("12.3456"), false);
  assert.equal(json.includes("99.9"), false);
  assert.equal(json.includes("/originals/"), false);
  assert.equal(json.includes(original), false);
  assert.equal(json.includes("capturedAt"), false);
  assert.equal(json.includes("exif"), false);
  assert.equal(json.includes("hasGps"), false);
  assert.deepEqual(store.presignGets, [preview]);
});
