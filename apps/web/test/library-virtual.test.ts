import assert from "node:assert/strict";
import test from "node:test";
import { groupPhotosByTime } from "../src/lib/library";
import { generateMockLibraryPhotos } from "../src/lib/library-mock";
import {
  buildDaySegments,
  libraryGridLayout,
  maxRenderedTiles,
  segmentBlockHeight,
  stickyContextAtScroll,
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

test("day segment height ignores year/month headers", () => {
  const layout = libraryGridLayout(1280, false);
  const three = segmentBlockHeight({ photos: generateMockLibraryPhotos(3), undated: false }, layout);
  const sameMonthLater = segmentBlockHeight({ photos: generateMockLibraryPhotos(3), undated: false }, layout);
  assert.equal(three, sameMonthLater);
  assert.ok(three < layout.dayHeader + layout.yearHeader + layout.monthHeader + 400);
});

test("sticky context follows scroll position within the same month", () => {
  const photos = generateMockLibraryPhotos(90);
  const segments = buildDaySegments(groupPhotosByTime(photos, "UTC"), libraryGridLayout(1280, false));
  const monthBucket = segments.filter((s) => !s.undated && s.month === segments[0]!.month && s.year === segments[0]!.year);
  assert.ok(monthBucket.length >= 2, "need multiple days in a month");
  const second = monthBucket[1]!;
  const ctx = stickyContextAtScroll(segments, second.offset + 2);
  assert.equal(ctx?.year, second.year);
  assert.equal(ctx?.month, second.month);
});
