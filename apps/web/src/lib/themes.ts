import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "@memora/shared";
import cottonCandy from "../../../../templates/cotton-candy/theme.json";
import kyotoLantern from "../../../../templates/kyoto-lantern/theme.json";
import magazineHeirloom from "../../../../templates/magazine-heirloom/theme.json";

export interface ThemeSkin {
  id: ThemeId;
  name: string;
  colors: {
    background: string;
    primary: string;
    accent: string;
    text: string;
  };
  radius: { card: number; button: number };
}

interface ThemeFile {
  id: string;
  name: string | { zh?: string; en?: string };
  tokens?: {
    colors?: {
      bg?: string;
      surface?: string;
      primary?: string;
      accent?: string;
      text?: string;
    };
    radius?: { md?: number; lg?: number };
  };
}

function displayName(name: ThemeFile["name"]): string {
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  if (name && typeof name === "object" && typeof name.zh === "string" && name.zh.trim().length > 0) {
    return name.zh.trim();
  }
  return "念册";
}

/** 卡片用 surface。tokens.colors.primary 在杂志主题里是深色品牌色，直接当底会和正文糊在一起。 */
function skin(file: ThemeFile): ThemeSkin {
  if (!isThemeId(file.id)) {
    throw new Error("theme_id_mismatch");
  }
  const colors = file.tokens?.colors ?? {};
  const radius = file.tokens?.radius ?? {};
  return {
    id: file.id,
    name: displayName(file.name),
    colors: {
      background: colors.bg ?? "#f6f3ee",
      primary: colors.surface ?? colors.primary ?? "#ffffff",
      accent: colors.accent ?? "#8a5a44",
      text: colors.text ?? "#1c1917",
    },
    radius: {
      card: radius.lg ?? radius.md ?? 16,
      button: radius.md ?? 12,
    },
  };
}

const SKINS: Record<ThemeId, ThemeSkin> = {
  "cotton-candy": skin(cottonCandy),
  "kyoto-lantern": skin(kyotoLantern),
  "magazine-heirloom": skin(magazineHeirloom),
};

/** 用 theme.json 的中文名和色板给分享页上肤。未知 id 回落到默认模板。 */
export function themeSkin(themeId: string): ThemeSkin {
  if (!isThemeId(themeId)) return SKINS[DEFAULT_THEME_ID];
  return SKINS[themeId];
}
