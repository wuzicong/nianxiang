/** 冒烟用的小图。JPEG 带一段固定 GPS，用来确认公开响应没有把 EXIF 带出去。 */

export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

/** sharp 生成的 8×6 JPEG，不含 APP1。冒烟在 SOI 后插入 EXIF。 */
const PLAIN_JPEG = Buffer.from(
  "/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAGAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCZAUgJ/9k=",
  "base64",
);

function entry(tag, type, count, value) {
  const buf = Buffer.alloc(12);
  buf.writeUInt16LE(tag, 0);
  buf.writeUInt16LE(type, 2);
  buf.writeUInt32LE(count, 4);
  buf.writeUInt32LE(value, 8);
  return buf;
}

function rationals(pairs) {
  const buf = Buffer.alloc(pairs.length * 8);
  pairs.forEach(([num, den], index) => {
    buf.writeUInt32LE(num, index * 8);
    buf.writeUInt32LE(den, index * 8 + 4);
  });
  return buf;
}

/** 与 worker 的 toDecimal 同一套浮点：度 + 分/60 + 秒/3600。 */
function decimal(degrees, minutes, seconds) {
  return Math.abs(degrees) + Math.abs(minutes) / 60 + Math.abs(seconds) / 3600;
}

const LAT_SECONDS = 419148 / 10000;
const LNG_SECONDS = 27652032 / 10000;
const LAT = decimal(35, 0, LAT_SECONDS);
const LNG = decimal(135, 0, LNG_SECONDS);

export const GPS_LAT_TEXT = JSON.stringify(LAT);
export const GPS_LNG_TEXT = JSON.stringify(LNG);
export const EXIF_DATE = "2020:01:02 03:04:05";

export function jpegWithGps() {
  const date = Buffer.from(`${EXIF_DATE}\0`, "ascii");
  const lat = rationals([
    [35, 1],
    [0, 1],
    [419148, 10000],
  ]);
  const lng = rationals([
    [135, 1],
    [0, 1],
    [27652032, 10000],
  ]);
  const ifd0At = 8;
  const ifd0Size = 2 + 2 * 12 + 4;
  const exifAt = ifd0At + ifd0Size;
  const exifSize = 2 + 12 + 4;
  const dateAt = exifAt + exifSize;
  const gpsAt = dateAt + date.length;
  const gpsSize = 2 + 4 * 12 + 4;
  const latAt = gpsAt + gpsSize;
  const lngAt = latAt + lat.length;
  const tiff = Buffer.alloc(lngAt + lng.length);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(0x2a, 2);
  tiff.writeUInt32LE(ifd0At, 4);
  tiff.writeUInt16LE(2, ifd0At);
  entry(0x8769, 4, 1, exifAt).copy(tiff, ifd0At + 2);
  entry(0x8825, 4, 1, gpsAt).copy(tiff, ifd0At + 14);
  tiff.writeUInt32LE(0, ifd0At + 26);
  tiff.writeUInt16LE(1, exifAt);
  entry(0x9003, 2, date.length, dateAt).copy(tiff, exifAt + 2);
  tiff.writeUInt32LE(0, exifAt + 14);
  date.copy(tiff, dateAt);
  tiff.writeUInt16LE(4, gpsAt);
  const latRef = entry(0x0001, 2, 2, 0);
  latRef.write("N", 8, "ascii");
  latRef.copy(tiff, gpsAt + 2);
  entry(0x0002, 5, 3, latAt).copy(tiff, gpsAt + 14);
  const lngRef = entry(0x0003, 2, 2, 0);
  lngRef.write("E", 8, "ascii");
  lngRef.copy(tiff, gpsAt + 26);
  entry(0x0004, 5, 3, lngAt).copy(tiff, gpsAt + 38);
  tiff.writeUInt32LE(0, gpsAt + 50);
  lat.copy(tiff, latAt);
  lng.copy(tiff, lngAt);

  const payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const app1 = Buffer.alloc(4 + payload.length);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  payload.copy(app1, 4);
  if (PLAIN_JPEG[0] !== 0xff || PLAIN_JPEG[1] !== 0xd8) {
    throw new Error("plain jpeg missing SOI");
  }
  return Buffer.concat([PLAIN_JPEG.subarray(0, 2), app1, PLAIN_JPEG.subarray(2)]);
}
