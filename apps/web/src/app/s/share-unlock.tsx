"use client";

import { useState } from "react";
import { parsePublicSharePayload, type PublicSharePayload } from "../../lib/share";
import { themeSkin, type ThemeSkin } from "../../lib/themes";
import { ShareGallery } from "./share-gallery";
import { ShareChrome } from "./share-chrome";

const FAILED = "无法打开分享。请确认密码；链接撤销或过期时也是这句话。";
const HINT = "输入密码后才能查看照片。";

function feedbackFor(message: string): "hint" | "pending" | "error" {
  if (message === HINT) return "hint";
  if (message === "正在打开…") return "pending";
  return "error";
}

export function ShareUnlock({ token, theme }: { token: string; theme: ThemeSkin }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(HINT);
  const [pending, setPending] = useState(false);
  const [share, setShare] = useState<PublicSharePayload | null>(null);

  async function unlock() {
    if (pending) return;
    setPending(true);
    setMessage("正在打开…");
    try {
      const response = await fetch(`/api/v1/public/shares/${encodeURIComponent(token)}/unlock`, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ password }),
      });
      const text = await response.text();
      if (!response.ok) {
        setMessage(FAILED);
        return;
      }
      let parsed: PublicSharePayload | null = null;
      try {
        parsed = parsePublicSharePayload(text ? JSON.parse(text) : null);
      } catch {
        parsed = null;
      }
      if (!parsed) {
        setMessage("暂时打不开，请稍后再试。");
        return;
      }
      setPassword("");
      setShare(parsed);
    } catch {
      setMessage("暂时打不开，请稍后再试。");
    } finally {
      setPending(false);
    }
  }

  if (share) {
    return (
      <ShareGallery
        share={share}
        theme={themeSkin(share.album.themeId)}
        refreshHint="刷新后需要再输入密码。"
      />
    );
  }

  const feedback = feedbackFor(message);

  return (
    <ShareChrome theme={theme} state="locked">
      <p className="share-brand">
        <a href="/">念册 · Memora</a>
      </p>
      <p className="share-kicker">{theme.name}</p>
      <h1 className="share-title">这本相册需要密码</h1>
      {theme.id === "cotton-candy" ? null : <hr className="share-rule" />}
      <p className="share-copy">密码不会出现在链接里。打开之后只在这一页里看图，刷新需要再输入一次。</p>
      <form
        className="share-form"
        method="post"
        action={`/api/v1/public/shares/${encodeURIComponent(token)}/unlock`}
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void unlock();
        }}
      >
        <label htmlFor="share-password">密码</label>
        <input
          id="share-password"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          minLength={8}
          maxLength={128}
          required
          value={password}
          aria-describedby="share-feedback"
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={pending}>
          {pending ? "正在打开…" : "打开"}
        </button>
      </form>
      <p id="share-feedback" className="share-note" role="status" data-share-feedback={feedback}>
        {message}
      </p>
      <noscript className="share-noscript">需要启用 JavaScript 才能提交密码。</noscript>
    </ShareChrome>
  );
}
