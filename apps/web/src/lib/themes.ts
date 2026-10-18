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

function skin(file: {
  id: string;
  name: string;
  colors: { background: string; primary: string; accent: string; text: string };
  radius: { card: number; button: number };
}): ThemeSkin {
  if (!isThemeId(file.id)) {
    throw new Error("theme_id_mismatch");
  }
  return {
    id: file.id,
    name: file.name,
    colors: {
      background: file.colors.background,
      primary: file.colors.primary,
      accent: file.colors.accent,
      text: file.colors.text,
    },
    radius: { card: file.radius.card, button: file.radius.button },
  };
}

const SKINS: Record<ThemeId, ThemeSkin> = {
  "cotton-candy": skin(cottonCandy),
  "kyoto-lantern": skin(kyotoLantern),
  "magazine-heirloom": skin(magazineHeirloom),
};

/** 用 theme.json 的名字和颜色给分享页上肤。未知 id 回落到默认模板。 */
export function themeSkin(themeId: string): ThemeSkin {
  if (!isThemeId(themeId)) return SKINS[DEFAULT_THEME_ID];
  return SKINS[themeId];
}
