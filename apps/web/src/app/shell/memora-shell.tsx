"use client";

import { DEFAULT_THEME_ID } from "@memora/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { themeSkin } from "../../lib/themes";
import { shareThemeStyle } from "../s/share-chrome";
import { ShareBackdrop, ShareTexture } from "../s/share-ornaments";

export type MemoraNav = "login" | "albums" | "library";

export function MemoraShell({
  children,
  active,
  variant = "tool",
  title,
  lede,
  status,
  statusRole,
  userEmail,
  privacyBadge,
  brandHref,
}: {
  children: ReactNode;
  active?: MemoraNav;
  variant?: "tool" | "auth";
  title?: string;
  lede?: ReactNode;
  status?: string;
  statusRole?: "status" | "alert";
  userEmail?: string | null;
  privacyBadge?: string;
  brandHref?: string;
}) {
  const router = useRouter();
  const skin = themeSkin(DEFAULT_THEME_ID);
  const style = shareThemeStyle(skin) as CSSProperties;
  const signedIn = Boolean(userEmail);
  const home = brandHref ?? (signedIn ? "/library" : "/");

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
  }

  return (
    <div
      className={`memora-shell share-shell${variant === "auth" ? " memora-shell--auth" : ""}`}
      data-theme={skin.id}
      style={style}
    >
      <ShareBackdrop themeId={skin.id} />
      <ShareTexture themeId={skin.id} />
      <div className="shell-bg" aria-hidden="true" />
      <a className="shell-skip" href="#shell-main">跳到内容</a>

      {variant === "tool" ? (
        <header className="shell-top lib-top">
          <div className="shell-wrap shell-top-inner">
            <Link className="lib-mark" href={home}>
              <span className="lib-mark-zh">念册 · Memora</span>
            </Link>
            {privacyBadge ? (
              <span className="lib-privacy-badge" title={privacyBadge}>{privacyBadge}</span>
            ) : null}
            <div className="shell-top-trail">
              <nav className="lib-nav shell-nav" aria-label="产品导航">
                <Link href="/library" aria-current={active === "library" ? "page" : undefined}>
                  照片库
                </Link>
                <Link href="/albums" aria-current={active === "albums" ? "page" : undefined}>
                  相册
                </Link>
                <Link href="/login" aria-current={active === "login" ? "page" : undefined}>
                  {signedIn ? "账户" : "登录"}
                </Link>
              </nav>
              <div className="lib-top-actions">
                {signedIn ? (
                  <>
                    <span className="lib-quiet shell-email" title={userEmail ?? undefined}>{userEmail}</span>
                    <button type="button" className="lib-quiet" onClick={() => void logout()}>
                      退出
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </header>
      ) : null}

      <main id="shell-main" className={`shell-main shell-wrap${variant === "auth" ? " shell-main--auth" : ""}`}>
        {variant === "tool" && (title || lede) ? (
          <header className="shell-hero">
            {title ? <h1>{title}</h1> : null}
            {lede ? <p className="shell-lede">{lede}</p> : null}
          </header>
        ) : null}
        {status ? (
          <p className="shell-status" role={statusRole === "alert" ? "alert" : "status"} aria-live="polite">
            {status}
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
