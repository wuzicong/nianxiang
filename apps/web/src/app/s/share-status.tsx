import { DEFAULT_THEME_ID } from "@memora/shared";
import { themeSkin, type ThemeSkin } from "../../lib/themes";
import { ShareChrome } from "./share-chrome";

export function ShareStatus({
  title,
  body,
  theme,
}: {
  title: string;
  body: string;
  theme?: ThemeSkin;
}) {
  const skin = theme ?? themeSkin(DEFAULT_THEME_ID);
  return (
    <ShareChrome theme={skin} state="status">
      <p className="share-brand">
        <a href="/">念册 · Memora</a>
      </p>
      <p className="share-kicker">{skin.name}</p>
      <h1 className="share-title">{title}</h1>
      {skin.id === "cotton-candy" ? null : <hr className="share-rule" />}
      <p className="share-copy">{body}</p>
    </ShareChrome>
  );
}
