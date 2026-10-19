import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isThemeId } from "@memora/shared";

const SVG_NAME = /^[a-z0-9-]+$/;

function templatesDir(): string {
  const starts = [process.cwd()];
  try {
    starts.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // 打包后没有 import.meta 时，只从 cwd 往上找。
  }
  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 8; depth += 1) {
      if (existsSync(join(dir, "templates", "theme.schema.json"))) return join(dir, "templates");
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("templates_not_found");
}

/** 只读 templates/{themeId}/assets/{name}.svg。名字来自 theme.json，不接受路径。 */
export function loadDecorationSvgs(themeId: string, names: readonly string[]): Record<string, string> {
  if (!isThemeId(themeId)) return {};
  const dir = join(templatesDir(), themeId, "assets");
  const loaded: Record<string, string> = {};
  for (const name of names) {
    if (!SVG_NAME.test(name)) continue;
    const file = join(dir, `${name}.svg`);
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim();
    if (!raw.includes("<svg")) continue;
    if (/<script|on[a-z]+\s*=/i.test(raw)) continue;
    loaded[name] = raw;
  }
  return loaded;
}
