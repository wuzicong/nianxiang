"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parsePublicSharePayload,
  parseRetryAfterSeconds,
  UNLOCK_FAILED,
  UNLOCK_RATE_LIMIT,
  type PublicSharePayload,
} from "../../lib/share";
import { themeSkin, type ThemeSkin } from "../../lib/themes";
import { ShareGallery } from "./share-gallery";
import { ShareChrome } from "./share-chrome";

const HINT = "输入密码后才能查看照片。";
const OPENING = "正在打开…";
const NETWORK_ERROR = "暂时打不开，请稍后再试。";
const MIN_PASSWORD = "密码至少 8 位。";

function feedbackFor(message: string): "hint" | "pending" | "error" | "limited" {
  if (message === HINT || message === MIN_PASSWORD) return "hint";
  if (message === OPENING) return "pending";
  if (message === UNLOCK_RATE_LIMIT) return "limited";
  return "error";
}

function submitLabel(
  themeId: string,
  pending: boolean,
  rateLimitSeconds: number | null,
  limited: boolean,
): string {
  if (pending) return OPENING;
  if (rateLimitSeconds !== null && rateLimitSeconds > 0) {
    return `${rateLimitSeconds} 秒后可再试`;
  }
  if (limited) return "请稍后再试";
  if (themeId === "magazine-heirloom") return "OPEN · 打开";
  return "打开";
}

export function ShareUnlock({ token, theme }: { token: string; theme: ThemeSkin }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(HINT);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [shake, setShake] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [share, setShare] = useState<PublicSharePayload | null>(null);

  const limited = message === UNLOCK_RATE_LIMIT || (rateLimitSeconds !== null && rateLimitSeconds > 0);

  const triggerShake = useCallback(() => {
    setShake(true);
    window.setTimeout(() => setShake(false), 260);
  }, []);

  useEffect(() => {
    if (rateLimitSeconds === null || rateLimitSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setRateLimitSeconds((prev) => {
        if (prev === null || prev <= 1) {
          setMessage((current) => (current === UNLOCK_RATE_LIMIT ? HINT : current));
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [rateLimitSeconds]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 641px)");
    if (mq.matches) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || !window.visualViewport) return;

    const scrollIntoView = () => {
      input.scrollIntoView({ block: "end" });
    };

    const onFocus = () => {
      scrollIntoView();
      window.visualViewport?.addEventListener("resize", scrollIntoView);
    };
    const onBlur = () => {
      window.visualViewport?.removeEventListener("resize", scrollIntoView);
    };

    input.addEventListener("focus", onFocus);
    input.addEventListener("blur", onBlur);
    return () => {
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("blur", onBlur);
      window.visualViewport?.removeEventListener("resize", scrollIntoView);
    };
  }, []);

  function selectAllPassword() {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(0, input.value.length);
  }

  function togglePasswordVisibility() {
    const input = inputRef.current;
    const start = input?.selectionStart ?? null;
    const end = input?.selectionEnd ?? null;
    setShowPassword((value) => !value);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (start !== null && end !== null) {
        el.setSelectionRange(start, end);
      }
    });
  }

  async function unlock() {
    if (pending || limited) return;
    if (password.length === 0) return;

    if (password.length < 8) {
      setMessage(MIN_PASSWORD);
      setInvalid(false);
      return;
    }

    setPending(true);
    setMessage(OPENING);
    setInvalid(false);
    try {
      const response = await fetch(`/api/v1/public/shares/${encodeURIComponent(token)}/unlock`, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ password }),
      });
      const text = await response.text();
      if (response.status === 429) {
        setRateLimitSeconds(parseRetryAfterSeconds(response.headers.get("Retry-After")));
        setMessage(UNLOCK_RATE_LIMIT);
        triggerShake();
        return;
      }
      if (!response.ok) {
        setMessage(UNLOCK_FAILED);
        setInvalid(true);
        selectAllPassword();
        triggerShake();
        return;
      }
      let parsed: PublicSharePayload | null = null;
      try {
        parsed = parsePublicSharePayload(text ? JSON.parse(text) : null);
      } catch {
        parsed = null;
      }
      if (!parsed) {
        setMessage(NETWORK_ERROR);
        triggerShake();
        return;
      }
      inputRef.current?.blur();
      setPassword("");
      setShare(parsed);
    } catch {
      setMessage(NETWORK_ERROR);
      triggerShake();
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
        focusTitleOnMount
      />
    );
  }

  const feedback = feedbackFor(message);
  const submitDisabled = pending || password.length === 0 || limited;

  return (
    <ShareChrome theme={theme} state="locked" shake={shake}>
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
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void unlock();
        }}
      >
        <label htmlFor="share-password">密码</label>
        <div className="share-password-row">
          <input
            ref={inputRef}
            id="share-password"
            type={showPassword ? "text" : "password"}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            minLength={8}
            maxLength={128}
            required
            enterKeyHint="go"
            disabled={pending}
            value={password}
            aria-invalid={invalid}
            aria-describedby="share-feedback"
            onChange={(event) => {
              setPassword(event.target.value);
              if (invalid) setInvalid(false);
              if (
                !limited &&
                message !== HINT &&
                message !== MIN_PASSWORD
              ) {
                setMessage(HINT);
              }
            }}
          />
          <button
            type="button"
            className="share-password-toggle"
            aria-pressed={showPassword}
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            onClick={togglePasswordVisibility}
          >
            <span aria-hidden="true">{showPassword ? "隐" : "显"}</span>
          </button>
        </div>
        <button
          type="submit"
          disabled={submitDisabled}
          data-share-submit={limited ? "limited" : "ready"}
        >
          {submitLabel(theme.id, pending, rateLimitSeconds, message === UNLOCK_RATE_LIMIT)}
        </button>
      </form>
      <p id="share-feedback" className="share-note" role="status" data-share-feedback={feedback}>
        {message}
      </p>
      <noscript className="share-noscript">需要启用 JavaScript 才能提交密码。</noscript>
    </ShareChrome>
  );
}
