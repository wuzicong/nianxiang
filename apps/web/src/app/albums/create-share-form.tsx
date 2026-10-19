"use client";

import { useId, useMemo, useState } from "react";
import { createShare, type CreatedShare } from "../../lib/albums-api";
import { sharePasswordRequiredFromEnv } from "../../lib/share-policy";
import type { ThemeSkin } from "../../lib/themes";
import { shareThemeStyle } from "../s/share-chrome";
import "./album-share.css";

const PASSWORD_HINT = "若设置密码，长度需在 8 到 128 位；密码不会写入分享链接。";
const PASSWORD_REQUIRED_HINT = "当前环境要求新建分享必须设置密码（8 到 128 位），且不会写入链接。";

function localDatetimeMin(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function feedbackKind(message: string): "hint" | "pending" | "error" | "success" {
  if (message === "正在创建…") return "pending";
  if (message.startsWith("分享已创建")) return "success";
  if (
    message.includes("需要") ||
    message.includes("不可") ||
    message.includes("无效") ||
    message.includes("不可达") ||
    message.includes("失败")
  ) {
    return "error";
  }
  return "hint";
}

function validatePassword(password: string, required: boolean): string | null {
  if (password.length === 0) {
    return required ? "请设置分享密码（8 到 128 位）。" : null;
  }
  if (password.length < 8 || password.length > 128) {
    return "密码长度需在 8 到 128 位之间。";
  }
  return null;
}

function validateExpiresAt(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return "请选择一个有效的失效时间。";
  if (date.getTime() <= Date.now()) return "失效时间需要晚于当前时刻。";
  return null;
}

export function CreateShareForm({
  albumId,
  theme,
  onCreated,
}: {
  albumId: string;
  theme: ThemeSkin;
  onCreated: () => void;
}) {
  const formId = useId();
  const passwordFieldId = `${formId}-password`;
  const passwordHintId = `${formId}-password-hint`;
  const expiresFieldId = `${formId}-expires`;
  const expiresHintId = `${formId}-expires-hint`;
  const feedbackId = `${formId}-feedback`;

  const [passwordRequired, setPasswordRequired] = useState(sharePasswordRequiredFromEnv());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [issued, setIssued] = useState<CreatedShare | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const expiresMin = useMemo(() => localDatetimeMin(), []);

  const shareUrl =
    issued && typeof window !== "undefined" ? `${window.location.origin}${issued.path}` : issued?.path ?? "";

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function submit() {
    if (pending) return;

    const passwordError = validatePassword(password, passwordRequired);
    if (passwordError) {
      setMessage(passwordError);
      return;
    }
    const expiresError = validateExpiresAt(expiresAt);
    if (expiresError) {
      setMessage(expiresError);
      return;
    }

    setPending(true);
    setMessage("正在创建…");
    setIssued(null);
    setCopyState("idle");
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
      setShowPassword(false);
      setExpiresAt("");
      setIssued(result.share);
      setMessage("分享已创建。请立即复制链接；关闭或刷新后无法从这里再次查看完整链接。");
      onCreated();
    } catch {
      setMessage("API 暂时不可达");
    } finally {
      setPending(false);
    }
  }

  const feedback = feedbackKind(message);

  return (
    <div
      className="share-shell album-share-shell"
      data-theme={theme.id}
      data-share-state="status"
      style={shareThemeStyle(theme)}
    >
      <article className="share-card">
        <div className="share-card-body">
          <h2 className="album-share-heading">新建分享</h2>
          <p className="album-share-lede">
            {passwordRequired
              ? PASSWORD_REQUIRED_HINT
              : "密码可选。留空则持链接即可打开（仍受撤销与失效时间约束）。密码永远不会出现在链接里。"}
          </p>

          <form
            className="share-form"
            aria-busy={pending}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div>
              <label htmlFor={passwordFieldId}>
                分享密码{passwordRequired ? "（必填）" : "（可选）"}
              </label>
              <div className="album-share-password-row">
                <input
                  id={passwordFieldId}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={passwordRequired ? 8 : undefined}
                  maxLength={128}
                  required={passwordRequired}
                  value={password}
                  aria-describedby={`${passwordHintId} ${feedbackId}`}
                  aria-invalid={feedback === "error" && message.includes("密码")}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="album-share-password-toggle"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "隐藏" : "显示"}
                </button>
              </div>
              <span id={passwordHintId} className="album-share-field-hint">
                {passwordRequired ? PASSWORD_REQUIRED_HINT : PASSWORD_HINT}
              </span>
            </div>

            <div>
              <label htmlFor={expiresFieldId}>失效时间（可选）</label>
              <input
                id={expiresFieldId}
                type="datetime-local"
                min={expiresMin}
                value={expiresAt}
                aria-describedby={`${expiresHintId} ${feedbackId}`}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <span id={expiresHintId} className="album-share-field-hint">
                留空表示不过期。到达该时间后，链接将无法再打开（仍可在此撤销）。
              </span>
            </div>

            <button type="submit" disabled={pending}>
              {pending ? "正在创建…" : "创建分享链接"}
            </button>
          </form>

          {message ? (
            <p
              id={feedbackId}
              className="share-note"
              role="status"
              data-share-feedback={feedback === "success" ? "hint" : feedback}
            >
              {message}
            </p>
          ) : null}

          {issued ? (
            <div className="album-share-success" aria-live="polite">
              <p style={{ margin: 0, lineHeight: 1.55 }}>
                <strong>只显示一次</strong> — 请现在复制并保存链接。此处不会再次显示完整令牌或路径。
              </p>
              <div className="album-share-success-copy">
                <div className="album-share-link-field">
                  <label htmlFor={`${formId}-issued-url`}>分享链接（不含密码）</label>
                  <input
                    id={`${formId}-issued-url`}
                    className="album-share-link-readonly"
                    readOnly
                    value={shareUrl}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </div>
                <button type="button" className="album-share-copy-btn" onClick={() => void copyShareLink()}>
                  {copyState === "copied" ? "已复制链接" : copyState === "failed" ? "复制失败，请手动选中上方链接" : "复制链接"}
                </button>
              </div>
              {issued.passwordProtected ? (
                <p className="album-share-callout" role="note">
                  已启用密码保护。请把<strong>链接</strong>与<strong>密码</strong>分开发给对方（例如分两条消息），不要把密码写进链接或同一则消息里。
                </p>
              ) : (
                <p className="album-share-field-hint" style={{ marginTop: "0.75rem" }}>
                  此链接未设密码，收到链接的人可直接打开。
                </p>
              )}
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
}
