import assert from "node:assert/strict";
import test from "node:test";
import type { PublicShareAsset } from "../src/lib/share-load";
import { shareGalleryAlt, shareGalleryCaption } from "../src/lib/share-gallery-media";
import { OWNED_PHOTO_ALT } from "../src/lib/owned-album";

function asset(overrides: Partial<PublicShareAsset> = {}): PublicShareAsset {
  return {
    assetId: "a1",
    filename: "IMG_0123.JPG",
    width: null,
    height: null,
    derivatives: {},
    takenAt: null,
    ...overrides,
  };
}

test("shareGalleryCaption never uses filename", () => {
  assert.equal(shareGalleryCaption(asset()), "");
  assert.equal(shareGalleryCaption(asset({ filename: "photo-1.jpg" })), "");
  assert.equal(shareGalleryCaption(asset({ takenAt: "2024-05-12T08:00:00" })), "2024.5");
});

test("shareGalleryAlt prefers short date over generic alt", () => {
  assert.equal(shareGalleryAlt(asset()), OWNED_PHOTO_ALT);
  assert.equal(shareGalleryAlt(asset({ filename: "DSC0001.JPG" })), OWNED_PHOTO_ALT);
  assert.equal(shareGalleryAlt(asset({ takenAt: "2024-05-12T08:00:00" })), "2024.5");
});
