import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const ASSET_SCHEMA_SQL = readFileSync(
  join(here, "..", "migrations", "001_assets.sql"),
  "utf8",
);
