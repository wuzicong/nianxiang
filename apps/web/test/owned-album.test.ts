import assert from "node:assert/strict";
import test from "node:test";
import cottonCandy from "../../../templates/cotton-candy/theme.json";
import kyotoLantern from "../../../templates/kyoto-lantern/theme.json";
import magazineHeirloom from "../../../templates/magazine-heirloom/theme.json";
import { parseAlbumAssets, type AlbumAssetView } from "../src/lib/album-assets";
import type { AlbumTheme } from "../src/lib/album-theme";
import { buildOwnedAlbum, derivativeSheetUrl, isDerivativeHttpUrl } from "../src/lib/owned-album";

const expiresAt = "2026-01-01T00:10:00.000Z";

interface ThemeFile {
  id: string;
  slots: Array<{ id: string; type: string; required?: boolean; hint?: string; min?: number; max?: number }>;
  shareCopyDefaults: { title: string; subtitle: string };
}

function themeFrom(file: ThemeFile): AlbumTheme {
  return {
    skin: { id: file.id },
    slots: file.slots.map((slot) => ({
      id: slot.id,
      type: slot.type,
      required: slot.required === true,
      caption: false,
      hint: slot.hint ?? null,
      min: slot.min ?? null,
      max: slot.max ?? null,
    })),
    shareTitle: file.shareCopyDefaults.title,
    shareSubtitle: file.shareCopyDefaults.subtitle,
  } as AlbumTheme;
}

function signed(kind: "derivatives" | "originals", assetId: string, file: string): string {
  return `https://cdn.example/memora/users/owner/${kind}/${assetId}/${file}?X-Amz-Signature=sekret`;
}

function view(
  assetId: string,
  previews: AlbumAssetView["previews"],
  status = "ready",
  filename = `${assetId}.jpg`,
): AlbumAssetView {
  return {
    assetId,
    filename,
    status,
    width: 1200,
    height: 800,
    error: null,
    previews,
  };
}

function sheet(assetId: string, file: "hero.webp" | "preview.webp" | "thumb.webp") {
  const size = file.replace(".webp", "") as "hero" | "preview" | "thumb";
  return { [size]: { url: signed("derivatives", assetId, file), expiresAt } };
}

test("sheet urls prefer the slot size and refuse originals", () => {
  const hero = signed("derivatives", "a", "hero.webp");
  const preview = signed("derivatives", "a", "preview.webp");
  const thumb = signed("derivatives", "a", "thumb.webp");
  const previews = {
    hero: { url: hero, expiresAt },
    preview: { url: preview, expiresAt },
    thumb: { url: thumb, expiresAt },
  };
  assert.equal(derivativeSheetUrl(previews, "hero"), hero);
  assert.equal(derivativeSheetUrl(previews, "spread-2"), preview);
  assert.equal(derivativeSheetUrl(previews, "polaroid-wall"), preview);
  assert.equal(derivativeSheetUrl({ thumb: previews.thumb }, "hero"), thumb);
  assert.equal(
    derivativeSheetUrl(
      {
        hero: { url: signed("originals", "a", "raw.jpg"), expiresAt },
        preview: { url: "javascript:alert(1)", expiresAt },
        thumb: previews.thumb,
      },
      "hero",
    ),
    thumb,
  );
  assert.equal(isDerivativeHttpUrl(signed("originals", "a", "raw.jpg")), false);
  assert.equal(isDerivativeHttpUrl("data:image/svg+xml,abc"), false);
});

test("owned cotton album fills cover, spread, then wall from derivatives only", () => {
  const theme = themeFrom(cottonCandy);
  const parsed = parseAlbumAssets([
    {
      assetId: "cover",
      filename: "window.jpg",
      status: "ready",
      key: "users/owner/originals/cover",
      previews: {
        hero: { url: signed("derivatives", "cover", "hero.webp"), expiresAt },
        preview: { url: signed("originals", "cover", "raw.jpg"), expiresAt },
      },
    },
    {
      assetId: "left",
      filename: "kitchen.png",
      status: "ready",
      previews: {
        hero: { url: signed("derivatives", "left", "hero.webp"), expiresAt },
        preview: { url: signed("derivatives", "left", "preview.webp"), expiresAt },
      },
    },
    {
      assetId: "right",
      filename: "bike.webp",
      status: "ready",
      previews: sheet("right", "thumb.webp"),
    },
    {
      assetId: "wall",
      filename: "a-very-long-filename-that-should-be-trimmed-before-it-becomes-a-caption.jpg",
      status: "ready",
      previews: sheet("wall", "preview.webp"),
    },
    {
      assetId: "queue",
      filename: "queue.jpg",
      status: "processing",
      previews: {},
    },
    {
      assetId: "broken",
      filename: "broken.jpg",
      status: "failed",
      previews: { hero: { url: signed("originals", "broken", "raw.jpg"), expiresAt } },
    },
  ]);
  const filled = buildOwnedAlbum(theme, { title: "我们的春天", assets: parsed });
  const byId = Object.fromEntries(filled.album.slots.map((slot) => [slot.id, slot]));
  assert.equal(filled.album.title, "我们的春天");
  assert.equal(byId.cover?.title, "我们的春天");
  assert.equal(byId.cover?.photos[0]?.src, signed("derivatives", "cover", "hero.webp"));
  assert.equal(byId.cover?.photos[0]?.caption, "window");
  assert.equal(byId["spread-a"]?.photos[0]?.src, signed("derivatives", "left", "preview.webp"));
  assert.equal(byId["spread-a"]?.photos[1]?.src, signed("derivatives", "right", "thumb.webp"));
  assert.equal(byId.polaroid?.photos.length, 1);
  assert.equal(byId.polaroid?.photos[0]?.caption.endsWith("…"), true);
  assert.equal((byId.polaroid?.photos[0]?.caption.length ?? 0) <= 43, true);
  assert.equal(byId.days?.photos.length, 0);
  assert.equal(filled.placed, 4);
  assert.equal(filled.ready, 4);
  assert.equal(filled.pending, 1);
  assert.equal(filled.unavailable, 1);
  const dumped = JSON.stringify(filled);
  assert.equal(dumped.includes("/originals/"), false);
  assert.equal(dumped.includes("data:image"), false);
  assert.equal(dumped.includes("javascript:"), false);
  const visible = filled.album.slots
    .flatMap((slot) => [slot.title, slot.body, slot.kicker, ...slot.photos.flatMap((photo) => [photo.alt, photo.caption])])
    .join("\n");
  assert.equal(visible.includes("X-Amz"), false);
  assert.equal(visible.includes("sekret"), false);
});

test("extra derivatives stay unplaced once each theme's photo slots are full", () => {
  const cases = [
    [cottonCandy, 1 + 2 + 9],
    [kyotoLantern, 1 + 2 + 8],
    [magazineHeirloom, 1 + 2 + 1 + 6],
  ] as const;
  for (const [file, capacity] of cases) {
    const theme = themeFrom(file);
    const assets = Array.from({ length: capacity + 3 }, (_, index) =>
      view(`asset-${index}`, sheet(`asset-${index}`, "preview.webp")),
    );
    const filled = buildOwnedAlbum(theme, { title: file.id, assets });
    const photoIds = filled.album.slots.flatMap((slot) => slot.photos.map((photo) => photo.id));
    assert.equal(filled.placed, capacity, file.id);
    assert.equal(filled.ready, capacity + 3);
    assert.equal(new Set(photoIds).size, photoIds.length);
    assert.equal(JSON.stringify(filled).includes("/originals/"), false);
    assert.equal(JSON.stringify(filled).includes("data:image"), false);
    if (file.id === "magazine-heirloom") {
      const bleed = filled.album.slots.find((slot) => slot.id === "full-bleed");
      assert.equal(bleed?.photos.length, 1);
      assert.equal(filled.album.slots.find((slot) => slot.id === "grid")?.photos.length, 6);
    }
  }
});

test("an album with no derivatives still keeps the template pages and no sample art", () => {
  const theme = themeFrom(kyotoLantern);
  const filled = buildOwnedAlbum(theme, {
    title: "夜路",
    assets: [view("soon", {}, "uploaded", "night.jpg")],
  });
  assert.equal(filled.placed, 0);
  assert.equal(filled.pending, 1);
  assert.equal(filled.album.slots.length, theme.slots.length);
  assert.equal(
    filled.album.slots.every((slot) => slot.photos.length === 0),
    true,
  );
  assert.equal(JSON.stringify(filled).includes("data:image"), false);
});
