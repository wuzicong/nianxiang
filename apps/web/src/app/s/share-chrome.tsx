import type { CSSProperties, ReactNode } from "react";
import type { ThemeSkin } from "../../lib/themes";
import { ShareBackdrop, ShareCardDecor, ShareCardFoot } from "./share-ornaments";

function buttonInk(brand: string, text: string, background: string): string {
  const hex = brand.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return text;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.62 ? text : background;
}

export function shareThemeStyle(theme: ThemeSkin): CSSProperties {
  return {
    "--share-bg": theme.colors.background,
    "--share-surface": theme.colors.primary,
    "--share-accent": theme.colors.accent,
    "--share-text": theme.colors.text,
    "--share-muted": theme.colors.muted,
    "--share-border": theme.colors.border,
    "--share-brand": theme.colors.brand,
    "--share-secondary": theme.colors.secondary,
    "--share-shadow": theme.shadow,
    "--share-radius-card": `${theme.radius.card}px`,
    "--share-radius-button": `${theme.radius.button}px`,
    "--share-radius-pill": `${theme.radius.pill}px`,
    "--share-font-title": theme.fonts.title,
    "--share-font-body": theme.fonts.body,
    "--share-ink": buttonInk(theme.colors.brand, theme.colors.text, theme.colors.background),
  } as CSSProperties;
}

export function ShareChrome({
  theme,
  state,
  children,
}: {
  theme: ThemeSkin;
  state: "locked" | "status";
  children: ReactNode;
}) {
  return (
    <main
      className="share-shell"
      data-share-state={state}
      data-theme={theme.id}
      style={shareThemeStyle(theme)}
    >
      <ShareBackdrop themeId={theme.id} />
      <article className="share-card">
        <ShareCardDecor themeId={theme.id} />
        <div className="share-card-body">{children}</div>
        <ShareCardFoot themeId={theme.id} />
      </article>
    </main>
  );
}
