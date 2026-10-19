import { THEME_IDS } from "@memora/shared";
import Link from "next/link";
import { albumFontFaces, albumTheme } from "../../lib/album-theme";
import { shareThemeStyle } from "../s/share-chrome";

export default function PreviewIndexPage() {
  return (
    <main className="preview-index">
      <p className="preview-index-crumb">
        <Link href="/">念册 · Memora</Link>
      </p>
      <h1>主题样张</h1>
      <p className="preview-index-lead">
        三套模板按 theme.json 的槽位排成一册。这里用的是示例图片，不需要登录，也不会打开真实相册。
        已有相册时，在相册页打开成册预览，会用同一套版式排你的预览图。
      </p>
      <div className="preview-index-grid">
        {THEME_IDS.map((id) => {
          const theme = albumTheme(id);
          if (!theme) return null;
          const faces = albumFontFaces(theme);
          return (
            <Link
              key={id}
              href={`/preview/${id}`}
              className="preview-index-card"
              data-theme={id}
              style={{
                ...shareThemeStyle(theme.skin),
                ["--album-title-face" as string]: faces.title,
                ["--album-body-face" as string]: faces.body,
              }}
            >
              <p className="kicker">{theme.englishName}</p>
              <h2>{theme.skin.name}</h2>
              <p>{theme.shareSubtitle}</p>
              <p className="layouts">{theme.layouts.includes("flip") ? "故事滚动 · 翻页" : "只排故事滚动"}</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
