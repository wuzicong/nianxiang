/** MVP 三套模板。id 与 `templates/<id>/theme.json` 一致。 */
export const THEME_IDS = ["cotton-candy", "kyoto-lantern", "magazine-heirloom"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = "cotton-candy";

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}
