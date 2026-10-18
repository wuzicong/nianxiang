import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "@memora/shared";
import cottonCandy from "../../../../templates/cotton-candy/theme.json";
import kyotoLantern from "../../../../templates/kyoto-lantern/theme.json";
import magazineHeirloom from "../../../../templates/magazine-heirloom/theme.json";

export interface ThemeSkin {
  id: ThemeId;
  name: string;
  colors: {
    /** 卡片底。杂志主题的 primary 是深色品牌色，不能直接当卡片底。 */
    background: string;
    primary: string;
    accent: string;
    text: string;
    muted: string;
    border: string;
    /** theme.json 的 colors.primary，按钮和强调色块用它。 */
    brand: string;
    secondary: string;
  };
  radius: { card: number; button: number; pill: number };
  shadow: string;
  fonts: { title: string; body: string };
}

interface ThemeFile {
  id: string;
  name: string | { zh?: string; en?: string };
  tokens?: {
    colors?: {
      bg?: string;
      surface?: string;
      primary?: string;
      secondary?: string;
      accent?: string;
      text?: string;
      muted?: string;
      border?: string;
    };
    radius?: { md?: number; lg?: number; pill?: number };
    shadow?: string;
    fonts?: { title?: string; body?: string };
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
  const fonts = file.tokens?.fonts ?? {};
  return {
    id: file.id,
    name: displayName(file.name),
    colors: {
      background: colors.bg ?? "#f6f3ee",
      primary: colors.surface ?? colors.primary ?? "#ffffff",
      accent: colors.accent ?? "#8a5a44",
      text: colors.text ?? "#1c1917",
      muted: colors.muted ?? "#8a8279",
      border: colors.border ?? "#e7e0d8",
      brand: colors.primary ?? "#f5c6c6",
      secondary: colors.secondary ?? colors.accent ?? "#c9b8e8",
    },
    radius: {
      card: radius.lg ?? radius.md ?? 16,
      button: radius.md ?? 12,
      pill: radius.pill ?? 999,
    },
    shadow: file.tokens?.shadow ?? "0 8px 24px rgba(44,42,41,0.08)",
    fonts: {
      title: fonts.title ?? "serif",
      body: fonts.body ?? "system-ui, sans-serif",
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

/** 只接受三套模板 id。别的 query 或正文一律当没写。 */
export function themeIdFromHint(value: unknown): ThemeId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !isThemeId(raw)) return null;
  return raw;
}

/**
 * 上锁页的模板：401 里的 themeId 优先，其次允许的 ?t=，否则棉花糖。
 * 解锁失败的响应不带模板，错误态沿用这里已经决定的皮肤。
 */
export function resolveLockedThemeId(apiThemeId: string | null, queryHint: unknown): ThemeId {
  if (apiThemeId && isThemeId(apiThemeId)) return apiThemeId;
  return themeIdFromHint(queryHint) ?? DEFAULT_THEME_ID;
}
