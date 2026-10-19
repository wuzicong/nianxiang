"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { safeUserMessage } from "../../lib/album-assets";
import { useSessionEmail } from "../../lib/use-session-email";
import { MemoraShell } from "../shell/memora-shell";

type PublicUser = { id: string; email: string };

type AuthResponse = { user?: PublicUser; error?: string; message?: string };

async function postAuth(path: string, body: { email: string; password: string }): Promise<{
  status: number;
  body: AuthResponse;
}> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as AuthResponse) : {} };
}

export default function LoginPage() {
  const router = useRouter();
  const sessionEmail = useSessionEmail();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [message, setMessage] = useState("正在检查会话…");
  const [pending, setPending] = useState<"login" | "register" | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/auth/me", { credentials: "include" });
    if (!response.ok) {
      setUser(null);
      setMessage("未登录");
      return;
    }
    const body = (await response.json()) as AuthResponse;
    setUser(body.user ?? null);
    setMessage(body.user ? "已登录" : "未登录");
  }, []);

  useEffect(() => {
    void refresh().catch(() => setMessage("API 暂时不可达"));
  }, [refresh]);

  async function submit(path: "/api/v1/auth/register" | "/api/v1/auth/login") {
    setPending(path.endsWith("login") ? "login" : "register");
    setMessage(path.endsWith("login") ? "登录中…" : "注册中…");
    try {
      const result = await postAuth(path, { email, password });
      if (result.body.user) {
        setUser(result.body.user);
        setPassword("");
        setMessage(path.endsWith("register") ? "注册成功" : "登录成功");
        router.push("/library");
        return;
      }
      setMessage(safeUserMessage(result.body.message, "登录或注册没成功，请检查邮箱和密码后再试。"));
    } catch {
      setMessage("API 暂时不可达");
    } finally {
      setPending(null);
    }
  }

  async function logout() {
    setMessage("正在退出…");
    const response = await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    if (response.status === 204) {
      setUser(null);
      setMessage("已退出");
      return;
    }
    setMessage("退出失败");
  }

  const statusRole =
    message.includes("没成功") || message.includes("不可达") || message === "退出失败" ? "alert" : "status";

  return (
    <MemoraShell variant="auth" active="login" userEmail={sessionEmail}>
      {user ? (
        <section className="shell-card" aria-labelledby="login-session-title">
          <Link className="shell-card-brand" href="/">念册 · Memora</Link>
          <p className="shell-kicker">欢迎回来</p>
          <h1 id="login-session-title">登录</h1>
          <p className="shell-muted" style={{ marginTop: "0.75rem" }}>{user.email}</p>
          <p className="lib-sr">{user.id}</p>
          <p className="shell-status" role="status" aria-live="polite">{message}</p>
          <div className="shell-actions">
            <Link className="lib-primary lib-link" href="/library">进入照片库</Link>
            <Link className="lib-quiet" href="/albums">管理相册</Link>
            <button type="button" className="lib-quiet" onClick={() => void logout()}>退出</button>
          </div>
        </section>
      ) : (
        <form
          className="shell-card"
          aria-labelledby="login-form-title"
          onSubmit={(event) => {
            event.preventDefault();
            void submit("/api/v1/auth/login");
          }}
        >
          <Link className="shell-card-brand" href="/">念册 · Memora</Link>
          <p className="shell-kicker">欢迎回来</p>
          <h1 id="login-form-title">登录</h1>
          <p className="shell-privacy">
            邮箱和密码只在你的空间里使用。会话放在 HttpOnly Cookie，页面脚本读不到。
          </p>
          <label className="shell-field">
            邮箱
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="shell-field">
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          <p className="shell-status" role={statusRole} aria-live="polite">{message}</p>
          <div className="shell-actions">
            <button type="submit" className="lib-primary" disabled={pending !== null}>
              {pending === "login" ? "登录中…" : "登录"}
            </button>
            <button
              type="button"
              className="lib-quiet"
              disabled={pending !== null}
              onClick={() => void submit("/api/v1/auth/register")}
            >
              {pending === "register" ? "注册中…" : "注册"}
            </button>
          </div>
        </form>
      )}
    </MemoraShell>
  );
}
