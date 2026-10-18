"use client";

import { useState } from "react";
import { parsePublicSharePayload, type PublicSharePayload } from "../../lib/share";
import { themeSkin } from "../../lib/themes";
import { ShareGallery } from "./share-gallery";

const FAILED = "无法打开分享。请确认密码；链接撤销或过期时也是这句话。";

export function ShareUnlock({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("输入密码后才能查看照片。");
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

  return (
    <main data-share-state="locked" style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/">念册 · Memora</a>
      </p>
      <h1 style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>这本相册需要密码</h1>
      <p style={{ lineHeight: 1.6, color: "#555" }}>
        密码不会出现在链接里。打开之后只在这一页里看图，刷新需要再输入一次。
      </p>
      <form
        method="post"
        action={`/api/v1/public/shares/${encodeURIComponent(token)}/unlock`}
        onSubmit={(event) => {
          event.preventDefault();
          void unlock();
        }}
        style={{ display: "grid", gap: "0.75rem", maxWidth: 360 }}
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
          onChange={(event) => setPassword(event.target.value)}
          style={{ padding: "0.6rem 0.7rem", font: "inherit" }}
        />
        <button type="submit" disabled={pending} style={{ padding: "0.6rem 0.8rem", font: "inherit" }}>
          {pending ? "正在打开…" : "打开"}
        </button>
      </form>
      <p style={{ lineHeight: 1.6, color: "#555" }}>{message}</p>
      <noscript>需要启用 JavaScript 才能提交密码。</noscript>
    </main>
  );
}
