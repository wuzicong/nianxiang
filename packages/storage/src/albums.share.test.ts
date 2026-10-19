import assert from "node:assert/strict";
import test from "node:test";
import { shareCapturedAt } from "./albums.js";

test("shareCapturedAt keeps only a capture string", () => {
  assert.equal(
    shareCapturedAt({
      capturedAt: "2020:01:02 03:04:05",
      hasGps: true,
      lat: 12.3456,
      lng: 99.9,
    }),
    "2020:01:02 03:04:05",
  );
  assert.equal(shareCapturedAt({ lat: 12.3456, lng: 99.9, hasGps: true }), null);
  assert.equal(shareCapturedAt({ capturedAt: 20200102 }), null);
  assert.equal(shareCapturedAt(null), null);
  assert.equal(shareCapturedAt(["2020:01:02 03:04:05"]), null);
});
