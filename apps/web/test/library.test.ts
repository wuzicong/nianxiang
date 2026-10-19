import assert from "node:assert/strict";
import test from "node:test";
import { ALBUM_ASSET_UNAVAILABLE } from "../src/lib/albums-api";
import { createThemedAlbum } from "../src/lib/library-api";
import {
  applyPhotoSelection,
  chronologicalAssetIds,
  flattenGroupIds,
  gridNeighbor,
  groupPhotosByTime,
  justifyPhotoRows,
  LIBRARY_SELECTION_LIMIT,
  libraryLightboxIds,
  libraryPhotoCaption,
  libraryRefreshDelay,
  normalizeCapturedAt,
  parseLibraryPayload,
  photoCalendar,
  suggestedAlbumTitle,
  type LibraryPhoto,
} from "../src/lib/library";

const signedThumb =
  "http://127.0.0.1:9000/memora-local/users/owner/derivatives/asset1/thumb.webp?X-Amz-Signature=supersecret";

function photo(partial: Partial<LibraryPhoto> & Pick<LibraryPhoto, "assetId">): LibraryPhoto {
  return {
    filename: `${partial.assetId}.jpg`,
    status: "ready",
    width: 400,
    height: 300,
    error: null,
    takenAt: null,
    uploadedAt: "2024-01-02T00:00:00.000Z",
    previews: {},
    ...partial,
  };
}

test("library payload keeps derivative previews and drops originals, GPS, and junk dates", () => {
  const parsed = parseLibraryPayload({
    hasMore: true,
    assets: [
      {
        assetId: "asset1",
        filename: "harbor.jpg",
        status: "ready",
        width: 640,
        height: 480,
        key: "users/owner/originals/asset1",
        userId: "owner",
        exif: { lat: 12.3456, lng: 99.9, hasGps: true, takenAt: "2020-01-02T03:04:05" },
        takenAt: "2020-01-02T03:04:05",
        uploadedAt: "2024-03-02T00:00:00.000Z",
        previews: {
          thumb: { url: signedThumb, expiresAt: "2026-01-01T00:10:00.000Z" },
          preview: {
            url: "http://127.0.0.1:9000/memora-local/users/owner/originals/asset1?X-Amz-Signature=supersecret",
            expiresAt: "2026-01-01T00:10:00.000Z",
          },
        },
      },
      {
        assetId: "asset2",
        filename: "bad.jpg",
        status: "ready",
        takenAt: "12.3456,99.9",
        uploadedAt: "not-a-date",
        previews: {},
      },
    ],
  });
  assert.equal(parsed.hasMore, true);
  assert.equal(parsed.photos.length, 2);
  assert.equal(parsed.photos[0]?.takenAt, "2020-01-02T03:04:05");
  assert.equal(parsed.photos[0]?.previews.thumb?.url, signedThumb);
  assert.equal(parsed.photos[0]?.previews.preview, undefined);
  assert.equal(parsed.photos[1]?.takenAt, null);
  assert.equal(parsed.photos[1]?.uploadedAt, "");
  const json = JSON.stringify(parsed);
  assert.equal(json.includes("/originals/"), false);
  assert.equal(json.includes("12.3456"), false);
  assert.equal(json.includes("hasGps"), false);
  assert.equal(normalizeCapturedAt("2020:01:02 03:04:05"), null);
});

test("time groups prefer capture day and fall back to upload day", () => {
  const groups = groupPhotosByTime(
    [
      photo({
        assetId: "capture",
        takenAt: "2020-01-02T03:04:05",
        uploadedAt: "2026-08-01T00:00:00.000Z",
      }),
      photo({
        assetId: "later",
        takenAt: "2020-01-02T18:00:00",
        uploadedAt: "2026-08-01T00:00:00.000Z",
      }),
      photo({
        assetId: "zoned",
        uploadedAt: "2024-01-01T16:30:00.000Z",
      }),
      photo({ assetId: "unknown", takenAt: null, uploadedAt: "" }),
    ],
    "UTC",
  );
  assert.equal(groups.undated.map((item) => item.assetId).join(), "unknown");
  assert.deepEqual(
    groups.years.map((year) => year.year),
    [2024, 2020],
  );
  const capturedDay = groups.years[1]?.months[0]?.days[0];
  assert.equal(capturedDay?.key, "2020-01-02");
  assert.equal(capturedDay?.uploadFallback, false);
  assert.deepEqual(
    capturedDay?.photos.map((item) => item.assetId),
    ["later", "capture"],
  );
  assert.match(capturedDay?.weekday ?? "", /周/);
  const uploadDay = groups.years[0]?.months[0]?.days[0];
  assert.equal(uploadDay?.uploadFallback, true);
  assert.equal(uploadDay?.key, "2024-01-01");

  const shanghai = photoCalendar(
    photo({ assetId: "zoned", uploadedAt: "2024-01-01T16:30:00.000Z" }),
    "Asia/Shanghai",
  );
  assert.equal(shanghai?.day, 2);
  assert.equal(shanghai?.source, "upload");
  const literal = photoCalendar(
    photo({ assetId: "capture", takenAt: "2020-01-02T03:04:05", uploadedAt: "2026-08-01T00:00:00.000Z" }),
    "Asia/Shanghai",
  );
  assert.equal(literal?.day, 2);
  assert.equal(literal?.month, 1);
  assert.equal(literal?.year, 2020);
  assert.equal(literal?.source, "capture");
});

test("selection toggles, shift-adds a range, and stops at 200", () => {
  const orderedIds = ["a", "b", "c", "d"];
  const first = applyPhotoSelection({ selected: [], orderedIds, id: "a", shift: false, anchor: null });
  assert.deepEqual(first.selected, ["a"]);
  const range = applyPhotoSelection({
    selected: first.selected,
    orderedIds,
    id: "c",
    shift: true,
    anchor: first.anchor,
  });
  assert.deepEqual(range.selected, ["a", "b", "c"]);
  assert.equal(range.anchor, "a");
  const off = applyPhotoSelection({
    selected: range.selected,
    orderedIds,
    id: "b",
    shift: false,
    anchor: range.anchor,
  });
  assert.deepEqual(off.selected, ["a", "c"]);
  const added = applyPhotoSelection({
    selected: off.selected,
    orderedIds,
    id: "b",
    shift: false,
    anchor: off.anchor,
    gesture: "add",
  });
  assert.deepEqual(added.selected, ["a", "c", "b"]);

  const many = Array.from({ length: LIBRARY_SELECTION_LIMIT + 5 }, (_, index) => `p${index}`);
  const seeded = applyPhotoSelection({
    selected: [],
    orderedIds: many,
    id: many[0] ?? "p0",
    shift: false,
    anchor: null,
  });
  const capped = applyPhotoSelection({
    selected: seeded.selected,
    orderedIds: many,
    id: many[many.length - 1] ?? "p0",
    shift: true,
    anchor: seeded.anchor,
  });
  assert.equal(capped.selected.length, LIBRARY_SELECTION_LIMIT);
  assert.equal(capped.capped, true);
});

test("justified rows fill the width and leave a short last row at the target height", () => {
  const squares = [
    { id: "a", aspect: 1 },
    { id: "b", aspect: 1 },
    { id: "c", aspect: 1 },
    { id: "d", aspect: 1 },
  ];
  const rows = justifyPhotoRows(squares, 640, { targetHeight: 180, gap: 10 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.length, 3);
  const fullWidth = (rows[0] ?? []).reduce((total, tile) => total + tile.width, 0) + 20;
  assert.equal(fullWidth, 640);
  assert.equal(rows[1]?.[0]?.width, 180);
  assert.equal(rows[1]?.[0]?.height, 180);

  const pair = justifyPhotoRows(squares.slice(0, 2), 640, { targetHeight: 180, gap: 10 });
  assert.equal(pair.length, 1);
  assert.equal(pair[0]?.[0]?.height, 180);
  assert.equal((pair[0] ?? []).reduce((total, tile) => total + tile.width, 0) + 10 < 640, true);
  assert.deepEqual(justifyPhotoRows([], 640), []);
  assert.deepEqual(justifyPhotoRows(squares, 20), []);
});

test("arrow keys move through justified rows", () => {
  const rows = [
    [{ id: "a" }, { id: "b" }],
    [{ id: "c" }],
  ];
  assert.equal(gridNeighbor(rows, "a", "ArrowRight"), "b");
  assert.equal(gridNeighbor(rows, "b", "ArrowDown"), "c");
  assert.equal(gridNeighbor(rows, "c", "ArrowUp"), "a");
  assert.equal(gridNeighbor(rows, "c", "End"), "c");
  assert.equal(gridNeighbor(rows, null, "Home"), "a");
});

test("album title and asset order follow the calendar", () => {
  const photos = [
    photo({ assetId: "new", takenAt: "2024-05-02T12:00:00" }),
    photo({ assetId: "old", takenAt: "2024-05-01T09:00:00" }),
  ];
  assert.equal(suggestedAlbumTitle(photos, "UTC"), "2024年5月1日 – 2024年5月2日");
  assert.deepEqual(chronologicalAssetIds(photos, ["new", "old"], "UTC"), ["old", "new"]);
  assert.equal(suggestedAlbumTitle([photos[1]!], "UTC"), "2024年5月1日");
  const groups = groupPhotosByTime(photos, "UTC");
  assert.deepEqual(flattenGroupIds(groups), ["new", "old"]);
});

test("create themed album posts assetIds atomically on create", async () => {
  const calls: { url: string; body: string }[] = [];
  const ids = Array.from({ length: 60 }, (_, index) => `p${index}`);
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body ?? "") });
    if (url === "/api/v1/albums") {
      return Response.json({ album: { albumId: "album-1", title: "2024年5月1日", themeId: "kyoto-lantern" } }, { status: 201 });
    }
    if (url === "/api/v1/albums/album-1/assets") {
      return Response.json({ albumId: "album-1", assetIds: [] });
    }
    return Response.json({ message: "http://127.0.0.1/originals/x?X-Amz-Signature=supersecret" }, { status: 500 });
  };
  const created = await createThemedAlbum(
    { title: " 2024年5月1日 ", themeId: "kyoto-lantern", assetIds: ids },
    { fetchImpl },
  );
  assert.deepEqual(created, { ok: true, albumId: "album-1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/v1/albums");
  assert.equal(calls[0]?.body.includes("userId"), false);
  const body = JSON.parse(calls[0]?.body ?? "{}") as { title: string; themeId: string; assetIds: string[] };
  assert.deepEqual(
    { title: body.title, themeId: body.themeId, count: body.assetIds.length },
    { title: "2024年5月1日", themeId: "kyoto-lantern", count: 60 },
  );

  const retryCalls: string[] = [];
  const failed = await createThemedAlbum(
    { title: "再试", themeId: "cotton-candy", assetIds: ["p0"], albumId: "album-1" },
    {
      fetchImpl: async (url: string) => {
        retryCalls.push(url);
        return Response.json({ message: "http://signed.example/?X-Amz-Signature=supersecret" }, { status: 404 });
      },
    },
  );
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.albumId, "album-1");
    assert.equal(failed.message, ALBUM_ASSET_UNAVAILABLE);
    assert.equal(failed.message.includes("supersecret"), false);
  }
  assert.deepEqual(retryCalls, ["/api/v1/albums/album-1/assets"]);
  assert.equal(libraryRefreshDelay([photo({ assetId: "p0", status: "processing" })]), 2000);
});

test("library lightbox order follows time groups and skips non-ready assets", () => {
  const preview =
    "http://127.0.0.1:9000/memora-local/users/owner/derivatives/a/preview.webp?X-Amz-Signature=ok";
  const ids = libraryLightboxIds(
    [
      photo({
        assetId: "new",
        takenAt: "2024-02-01T10:00:00",
        previews: { preview: { url: preview, expiresAt: "2026-01-01T00:00:00.000Z" } },
      }),
      photo({ assetId: "old", takenAt: "2024-01-01T10:00:00", status: "processing" }),
      photo({
        assetId: "mid",
        takenAt: "2024-01-15T10:00:00",
        previews: { thumb: { url: signedThumb, expiresAt: "2026-01-01T00:00:00.000Z" } },
      }),
    ],
    "UTC",
  );
  assert.deepEqual(ids, ["new", "mid"]);
  const caption = libraryPhotoCaption(
    photo({ assetId: "x", takenAt: "2024-03-02T14:30:00", uploadedAt: "2024-04-01T00:00:00.000Z" }),
    "UTC",
  );
  assert.match(caption, /2024/);
  assert.equal(caption.includes(".jpg"), false);
});
