import assert from "node:assert/strict";
import test from "node:test";
import cottonCandy from "../../../templates/cotton-candy/theme.json";
import { buildDemoAlbum } from "../src/lib/album-demo";
import type { AlbumTheme } from "../src/lib/album-theme";
import { orderedAlbumPhotos } from "../src/lib/album-preview-photos";

function minimalTheme(file: typeof cottonCandy): AlbumTheme {
  return {
    skin: { id: file.id, name: file.id },
    slots: file.slots.map((slot) => ({
      id: slot.id,
      type: slot.type,
      required: slot.required === true,
      hint: slot.hint ?? null,
      min: slot.min,
      max: slot.max,
    })),
    shareTitle: file.shareCopyDefaults.title,
    shareSubtitle: file.shareCopyDefaults.subtitle,
    englishName: file.id,
    layouts: ["story", "flip"],
    decorations: [],
    handFont: "inherit",
    motionEnter: "fade-up",
    respectReducedMotion: true,
    radiusSm: 8,
    noise: 0.12,
    hoverLift: 4,
    stickerTiltDeg: [0],
  };
}

test("orderedAlbumPhotos walks slots in order without duplicate ids", () => {
  const album = buildDemoAlbum(minimalTheme(cottonCandy));
  const ordered = orderedAlbumPhotos(album);
  assert.ok(ordered.length > 4);
  const ids = ordered.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], album.slots.find((s) => s.type === "hero")?.photos[0]?.id);
});
