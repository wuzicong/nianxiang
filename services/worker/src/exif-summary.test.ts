import assert from "node:assert/strict";
import test from "node:test";
import { extractExifFields, orientedSize } from "./exif-summary.js";

test("orientedSize swaps axes for sideways EXIF orientations", () => {
  assert.deepEqual(orientedSize(4000, 3000, 1), { width: 4000, height: 3000 });
  assert.deepEqual(orientedSize(4000, 3000, 6), { width: 3000, height: 4000 });
  assert.deepEqual(orientedSize(undefined, 10, 6), { width: undefined, height: 10 });
});

test("extractExifFields reads v2 GPS and date without requiring a binary", () => {
  const parsed = extractExifFields({
    Photo: { DateTimeOriginal: new Date("2020-01-02T03:04:05.000Z") },
    GPSInfo: {
      GPSLatitude: [30, 15, 0],
      GPSLatitudeRef: "N",
      GPSLongitude: [120, 30, 0],
      GPSLongitudeRef: "E",
    },
  });
  assert.equal(parsed.hasGps, true);
  assert.equal(parsed.lat, 30.25);
  assert.equal(parsed.lng, 120.5);
  assert.equal(parsed.capturedAt, "2020-01-02T03:04:05.000Z");
});

test("extractExifFields reads v1 south/west tags and ignores broken coordinates", () => {
  const parsed = extractExifFields({
    exif: { DateTimeOriginal: "2020:01:02 03:04:05" },
    gps: {
      GPSLatitude: [10, 0, 0],
      GPSLatitudeRef: "S",
      GPSLongitude: [20, 0, 0],
      GPSLongitudeRef: "W",
    },
  });
  assert.equal(parsed.lat, -10);
  assert.equal(parsed.lng, -20);
  assert.equal(parsed.capturedAt, "2020:01:02 03:04:05");

  const broken = extractExifFields({
    gps: { GPSLatitude: [120, 0, 0], GPSLatitudeRef: "N", GPSLongitude: [10, 0, 0], GPSLongitudeRef: "E" },
  });
  assert.equal(broken.hasGps, false);
  assert.equal(broken.lat, undefined);
});
