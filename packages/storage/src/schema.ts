import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** 与 assets / auth / albums 迁移共用，避免并发建表。 */
export const SCHEMA_ADVISORY_LOCK = "4815162342";

export const ASSET_SCHEMA_SQL = readFileSync(
  join(here, "..", "migrations", "001_assets.sql"),
  "utf8",
);

export const AUTH_SCHEMA_SQL = readFileSync(
  join(here, "..", "migrations", "002_auth.sql"),
  "utf8",
);

export const ALBUM_SCHEMA_SQL = readFileSync(
  join(here, "..", "migrations", "003_albums.sql"),
  "utf8",
);
