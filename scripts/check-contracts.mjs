import {
  ALL_JOB_NAMES,
  JOB_NAMES,
  albumExportKey,
  bucketName,
  clampPresignTtlMinutes,
  derivativeObjectKey,
  originalObjectKey,
  templateAssetPrefix,
} from "../packages/shared/dist/index.js";

const expectedJobs = [
  "media.derivative",
  "meta.exif",
  "meta.geocode",
  "ml.face",
  "ml.clip",
  "ml.scene",
  "smart.album.refresh",
  "album.render",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (ALL_JOB_NAMES.length !== expectedJobs.length) {
  fail(`job count ${ALL_JOB_NAMES.length} != ${expectedJobs.length}`);
}

for (const name of expectedJobs) {
  if (!ALL_JOB_NAMES.includes(name)) fail(`missing job ${name}`);
}

const byConst = Object.values(JOB_NAMES);
if (byConst.length !== expectedJobs.length) fail("JOB_NAMES drifted");

if (bucketName("prod") !== "memora-prod") fail("bucketName");
if (originalObjectKey("u1", "a1") !== "users/u1/originals/a1") {
  fail("originalObjectKey");
}
if (derivativeObjectKey("u1", "a1", "thumb") !== "users/u1/derivatives/a1/thumb.webp") {
  fail("derivativeObjectKey");
}
if (albumExportKey("alb", "job") !== "albums/alb/exports/job.pdf") fail("albumExportKey");
if (templateAssetPrefix("cotton-candy") !== "templates/cotton-candy/assets/") {
  fail("templateAssetPrefix");
}
if (clampPresignTtlMinutes(1) !== 5) fail("presign min");
if (clampPresignTtlMinutes(10) !== 10) fail("presign default");
if (clampPresignTtlMinutes(99) !== 15) fail("presign max");
if (clampPresignTtlMinutes(Number.NaN) !== 10) fail("presign nan");

console.log("contracts ok");
