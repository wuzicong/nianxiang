import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ABSOLUTE_MAX_UPLOAD_BYTES,
  ALL_JOB_NAMES,
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_THEME_ID,
  JOB_NAMES,
  THEME_IDS,
  albumExportKey,
  bucketName,
  clampPresignTtlMinutes,
  derivativeObjectKey,
  isAllowedUploadContentType,
  isSafeStorageId,
  isShareToken,
  isThemeId,
  originalObjectKey,
  resolveMaxUploadBytes,
  sharePagePath,
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

if (!isAllowedUploadContentType("image/jpeg")) fail("jpeg allowed");
if (!isAllowedUploadContentType("IMAGE/PNG; charset=binary")) fail("png normalized");
if (isAllowedUploadContentType("image/svg+xml")) fail("svg rejected");
if (isAllowedUploadContentType("application/octet-stream")) fail("octet rejected");
if (resolveMaxUploadBytes(undefined) !== DEFAULT_MAX_UPLOAD_BYTES) fail("upload default");
if (resolveMaxUploadBytes("nope") !== DEFAULT_MAX_UPLOAD_BYTES) fail("upload invalid");
if (resolveMaxUploadBytes(String(ABSOLUTE_MAX_UPLOAD_BYTES + 1)) !== ABSOLUTE_MAX_UPLOAD_BYTES) {
  fail("upload absolute cap");
}
if (!isSafeStorageId("user_1")) fail("safe id");
if (isSafeStorageId("../etc")) fail("reject traversal id");
if (isSafeStorageId("")) fail("reject empty id");

if (!isShareToken("A".repeat(43))) fail("share token shape");
if (isShareToken("short")) fail("share token short");
if (isShareToken(`${"A".repeat(42)}/`)) fail("share token slash");
if (isShareToken("A".repeat(44))) fail("share token long");
if (!sharePagePath("A".repeat(43)).startsWith("/s/")) fail("share path");

const templateRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
const themeDirs = readdirSync(templateRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const expectedThemes = [...THEME_IDS].sort();
if (themeDirs.join() !== expectedThemes.join()) {
  fail(`theme dirs ${themeDirs.join()} != ${expectedThemes.join()}`);
}
if (DEFAULT_THEME_ID !== "cotton-candy" || !isThemeId(DEFAULT_THEME_ID)) fail("default theme");
for (const id of THEME_IDS) {
  const theme = JSON.parse(readFileSync(join(templateRoot, id, "theme.json"), "utf8"));
  if (theme.id !== id) fail(`theme id ${id}`);
  const name =
    typeof theme.name === "string"
      ? theme.name
      : typeof theme.name?.zh === "string"
        ? theme.name.zh
        : "";
  if (name.length < 1) fail(`theme name ${id}`);
  for (const key of ["bg", "surface", "primary", "text", "accent"]) {
    if (typeof theme.tokens?.colors?.[key] !== "string") fail(`theme color ${id}.${key}`);
  }
  if (typeof theme.tokens?.radius?.md !== "number") fail(`theme radius ${id}.md`);
  if (typeof theme.tokens?.radius?.lg !== "number") fail(`theme radius ${id}.lg`);
}

console.log("contracts ok");
