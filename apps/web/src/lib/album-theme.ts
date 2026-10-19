import { isThemeId, type ThemeId } from "@memora/shared";
import cottonCandy from "../../../../templates/cotton-candy/theme.json";
import kyotoLantern from "../../../../templates/kyoto-lantern/theme.json";
import magazineHeirloom from "../../../../templates/magazine-heirloom/theme.json";
import { themeSkin, type ThemeSkin } from "./themes";

export type AlbumLayoutMode = "story" | "flip";

export interface AlbumSlot {
  id: string;
  type: string;
  required: boolean;
  caption: boolean;
  hint: string | null;
  min: number | null;
  max: number | null;
}

/** theme.json 里成册需要的字段。色板和圆角仍走 themeSkin，避免和分享页各写一套。 */
export interface AlbumTheme {
  skin: ThemeSkin;
  englishName: string;
  layouts: AlbumLayoutMode[];
  slots: AlbumSlot[];
  decorations: string[];
  handFont: string;
  radiusSm: number;
  stickerTiltDeg: number[];
  noise: number;
  motionEnter: string;
  hoverLift: number;
  respectReducedMotion: boolean;
  shareTitle: string;
  shareSubtitle: string;
}

const FILES: Record<ThemeId, unknown> = {
  "cotton-candy": cottonCandy,
  "kyoto-lantern": kyotoLantern,
  "magazine-heirloom": magazineHeirloom,
};

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseSlot(item: unknown): AlbumSlot | null {
  const row = record(item);
  if (typeof row.id !== "string" || typeof row.type !== "string") return null;
  if (!/^[a-z0-9-]+$/.test(row.id)) return null;
  return {
    id: row.id,
    type: row.type,
    required: row.required === true,
    caption: row.caption === true,
    hint: typeof row.hint === "string" ? row.hint : null,
    min: typeof row.min === "number" ? row.min : null,
    max: typeof row.max === "number" ? row.max : null,
  };
}

export function parseAlbumTheme(themeId: ThemeId, file: unknown): AlbumTheme {
  const root = record(file);
  const name = record(root.name);
  const tokens = record(root.tokens);
  const radius = record(tokens.radius);
  const fonts = record(tokens.fonts);
  const motion = record(tokens.motion);
  const share = record(root.shareCopyDefaults);
  const skin = themeSkin(themeId);
  const layouts = Array.isArray(root.layouts)
    ? root.layouts.filter((item): item is AlbumLayoutMode => item === "story" || item === "flip")
    : [];
  const tilt = Array.isArray(tokens.stickerTiltDeg)
    ? tokens.stickerTiltDeg.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
  const decorations = Array.isArray(root.decorations)
    ? root.decorations.filter((item): item is string => typeof item === "string" && /^[a-z0-9-]+$/.test(item))
    : [];
  const slots = Array.isArray(root.slots)
    ? root.slots.flatMap((item) => {
        const slot = parseSlot(item);
        return slot ? [slot] : [];
      })
    : [];
  return {
    skin,
    englishName: str(name.en, skin.name),
    layouts: layouts.length > 0 ? layouts : ["story"],
    slots,
    decorations,
    handFont: str(fonts.hand, str(fonts.title, skin.fonts.title)),
    radiusSm: num(radius.sm, num(radius.md, 8)),
    stickerTiltDeg: tilt.length > 0 ? tilt : [0],
    noise: num(tokens.noise, 0),
    motionEnter: str(motion.enter, "fade-up"),
    hoverLift: num(motion.hoverLift, 0),
    respectReducedMotion: motion.respectReducedMotion !== false,
    shareTitle: str(share.title, skin.name),
    shareSubtitle: str(share.subtitle, ""),
  };
}

const THEMES: Record<ThemeId, AlbumTheme> = {
  "cotton-candy": parseAlbumTheme("cotton-candy", FILES["cotton-candy"]),
  "kyoto-lantern": parseAlbumTheme("kyoto-lantern", FILES["kyoto-lantern"]),
  "magazine-heirloom": parseAlbumTheme("magazine-heirloom", FILES["magazine-heirloom"]),
};

export function albumTheme(themeId: string): AlbumTheme | null {
  if (!isThemeId(themeId)) return null;
  return THEMES[themeId];
}

/** 杂志只有 story。请求 flip 但模板没写时，留在 story。 */
export function resolveAlbumLayout(theme: AlbumTheme, requested: string | null | undefined): AlbumLayoutMode {
  if ((requested === "flip" || requested === "story") && theme.layouts.includes(requested)) return requested;
  if (theme.layouts.includes("story")) return "story";
  return theme.layouts[0] ?? "story";
}

/** 主题声明的字体名能对上已加载的西文时，把它放在 font-family 最前面。 */
export function albumFontFaces(theme: AlbumTheme): { title: string; body: string; hand: string } {
  const join = (declared: string) => {
    const loaded = loadedFamily(declared);
    return loaded ? `${loaded}, ${declared}` : declared;
  };
  return {
    title: join(theme.skin.fonts.title),
    body: join(theme.skin.fonts.body),
    hand: join(theme.handFont),
  };
}

function loadedFamily(declared: string): string | null {
  if (declared.includes("Fraunces")) return "var(--font-fraunces)";
  if (declared.includes("Cormorant")) return "var(--font-cormorant)";
  if (declared.includes("Inter")) return "var(--font-inter)";
  if (declared.includes("Caveat")) return "var(--font-caveat)";
  return null;
}
