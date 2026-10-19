import { DEFAULT_THEME_ID } from "@memora/shared";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { themeSkin } from "../../lib/themes";
import { shareThemeStyle } from "../s/share-chrome";
import { ShareBackdrop, ShareTexture } from "../s/share-ornaments";

export type ProductNav = "login" | "albums" | "library";

export function ProductShell({
  children,
  active,
  title,
  lede,
  status,
  statusRole,
}: {
  children: ReactNode;
  active?: ProductNav;
  title?: string;
  lede?: string;
  status?: string;
  statusRole?: "status" | "alert";
}) {
  const skin = themeSkin(DEFAULT_THEME_ID);
  const style = shareThemeStyle(skin) as CSSProperties;

  return (
    <div className="product-shell share-shell" data-theme={skin.id} style={style}>
      <ShareBackdrop themeId={skin.id} />
      <ShareTexture themeId={skin.id} />
      <div className="ps-bg" aria-hidden="true" />
      <a className="ps-skip" href="#product-main">跳到内容</a>
      <header className="ps-top">
        <div className="ps-wrap ps-top-inner">
          <Link className="ps-mark" href="/">
            <strong>念册</strong>
            <span>Memora</span>
          </Link>
          <nav className="ps-nav" aria-label="产品导航">
            <Link href="/library" data-active={active === "library" ? "true" : undefined}>
              照片库
            </Link>
            <Link href="/albums" data-active={active === "albums" ? "true" : undefined}>
              相册
            </Link>
            <Link href="/login" data-active={active === "login" ? "true" : undefined}>
              登录
            </Link>
          </nav>
        </div>
      </header>
      <main id="product-main" className="ps-main ps-wrap">
        {title || lede ? (
          <header className="ps-hero">
            {title ? <h1>{title}</h1> : null}
            {lede ? <p className="ps-lede">{lede}</p> : null}
          </header>
        ) : null}
        {status ? (
          <p className="ps-status" role={statusRole === "alert" ? "alert" : "status"}>
            {status}
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
