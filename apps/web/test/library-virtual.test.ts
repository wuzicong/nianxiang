import assert from "node:assert/strict";
import test from "node:test";
import { groupPhotosByTime } from "../src/lib/library";
import { generateMockLibraryPhotos } from "../src/lib/library-mock";
import {
  buildDaySegments,
  libraryGridLayout,
  maxRenderedTiles,
  virtualWindowForScroll,
} from "../src/lib/library-virtual";

test("virtual window caps rendered tiles for ~2000 photos", () => {
  const photos = generateMockLibraryPhotos(2000);
  const groups = groupPhotosByTime(photos, "UTC");
  const layout = libraryGridLayout(1280, false);
  const segments = buildDaySegments(groups, layout);
  assert.ok(segments.length > 100);
  const totalHeight = segments[segments.length - 1]!.offset + segments[segments.length - 1]!.height;
  const midScroll = totalHeight * 0.45;
  const window = virtualWindowForScroll(segments, midScroll, 800, layout);
  const tiles = maxRenderedTiles(segments, window, layout);
  assert.ok(tiles < 500, `expected DOM tile cap, got ${tiles}`);
  assert.ok(tiles > 20, `expected some tiles in window, got ${tiles}`);
  assert.ok(window.end - window.start < 80, "expected narrow day window");
});

test("segment offsets are monotonic and cover total height", () => {
  const photos = generateMockLibraryPhotos(400);
  const segments = buildDaySegments(groupPhotosByTime(photos, "UTC"), libraryGridLayout(375, true));
  for (let index = 1; index < segments.length; index += 1) {
    const prev = segments[index - 1]!;
    const current = segments[index]!;
    assert.equal(current.offset, prev.offset + prev.height);
  }
});
