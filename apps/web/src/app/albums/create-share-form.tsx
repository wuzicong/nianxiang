"use client";

import { useState } from "react";
import { createShare, type CreatedShare } from "../../lib/albums-api";
import { sharePasswordRequiredFromEnv } from "../../lib/share-policy";

const fieldStyle = { display: "block", width: "100%", marginTop: 4, padding: "0.4rem" };

export function CreateShareForm({
  albumId,
  onCreated,
}: {
  albumId: string;
  onCreated: () => void;
}) {
  const [passwordRequired, setPasswordRequired] = useState(sharePasswordRequiredFromEnv());
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [issued, setIssued] = useState<CreatedShare | null>(null);

  async function submit() {
    if (pending) return;
    if (passwordRequired && password.length < 8) {
      setMessage("分享需要 8 到 128 位密码。");
      return;
    }
    setPending(true);
    setMessage("正在创建…");
    setIssued(null);
    try {
      const result = await createShare(albumId, {
        password: password.length > 0 ? password : undefined,
        expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
      });
      if (!result.ok) {
        if (result.error === "password_required") setPasswordRequired(true);
        setMessage(result.message);
        return;
      }
      setPassword("");
      setExpiresAt("");
      setIssued(result.share);
      setMessage("分享已创建。链接和令牌只显示一次，请复制保存。");
      onCreated();
    } catch {
      setMessage("API 暂时不可达");
    } finally {
      setPending(false);
    }
  }

  const shareUrl =
    issued && typeof window !== "undefined" ? `${window.location.origin}${issued.path}` : issued?.path ?? "";

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>新建分享</h2>
      <p style={{ lineHeight: 1.6, color: "#555" }}>
        密码可选，不会写进链接。留空则任何人持链接即可打开（仍受撤销与过期约束）。
        {passwordRequired ? " 当前环境要求新建分享必须设密码。" : ""}
      </p>
      <form
        style={{ display: "grid", gap: "0.75rem", maxWidth: 420, marginTop: "1rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          分享密码{passwordRequired ? "（必填）" : "（可选）"}
          <input
            type="password"
            autoComplete="new-password"
            minLength={passwordRequired ? 8 : undefined}
            maxLength={128}
            required={passwordRequired}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={fieldStyle}
          />
        </label>
        <label>
          过期时间（可选）
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            style={fieldStyle}
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "正在创建…" : "创建分享链接"}
        </button>
      </form>
      {message ? <p style={{ lineHeight: 1.6, color: "#555", marginTop: "0.75rem" }}>{message}</p> : null}
      {issued ? (
        <div
          style={{
            marginTop: "1rem",
            padding: "1rem",
            border: "1px solid #ddd",
            borderRadius: 8,
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            wordBreak: "break-all",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontFamily: "inherit" }}>
            <strong>只显示一次</strong> — 关闭或刷新后无法再从这里找回令牌。
          </p>
          <p style={{ margin: 0 }}>页面路径：{issued.path}</p>
          <p style={{ margin: "0.5rem 0 0" }}>完整链接：{shareUrl}</p>
          {issued.passwordProtected ? (
            <p style={{ margin: "0.5rem 0 0", fontFamily: "inherit", color: "#555" }}>
              已启用密码。请把链接和密码分开发给对方。
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
