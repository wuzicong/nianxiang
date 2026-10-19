import assert from "node:assert/strict";
import test from "node:test";
import { libraryTakenAt, parseLibraryLimit } from "./present.js";

test("library capture time keeps the camera calendar and drops coordinates", () => {
  assert.equal(
    libraryTakenAt({ capturedAt: "2020:01:02 03:04:05", hasGps: true, lat: 12.3456, lng: 99.9 }),
    "2020-01-02T03:04:05",
  );
  assert.equal(
    libraryTakenAt({ capturedAt: "2020-01-02T03:04:05.000Z", lat: 1 }),
    "2020-01-02T03:04:05.000Z",
  );
  assert.equal(libraryTakenAt({ lat: 12.3456, lng: 99.9, hasGps: true }), null);
  assert.equal(libraryTakenAt({ capturedAt: "12.3456,99.9" }), null);
  assert.equal(libraryTakenAt({ capturedAt: "2020:13:02 03:04:05" }), null);
  assert.equal(libraryTakenAt({ capturedAt: "2020:01:02 03:04:05 extra" }), null);
  assert.equal(libraryTakenAt(null), null);
});

test("library page limit stays inside 1 to 240", () => {
  assert.equal(parseLibraryLimit(undefined), 240);
  assert.equal(parseLibraryLimit("1"), 1);
  assert.equal(parseLibraryLimit("240"), 240);
  assert.throws(() => parseLibraryLimit("0"), /limit/);
  assert.throws(() => parseLibraryLimit("241"), /limit/);
  assert.throws(() => parseLibraryLimit("1.5"), /limit/);
  assert.throws(() => parseLibraryLimit(["1"]), /limit/);
});
