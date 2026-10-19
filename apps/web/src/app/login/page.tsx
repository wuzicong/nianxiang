"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { safeUserMessage } from "../../lib/album-assets";
import { ProductShell } from "../product-shell/product-shell";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [message, setMessage] = useState("正在检查会话…");

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
    setMessage("提交中…");
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

  const statusRole = message.includes("没成功") || message.includes("不可达") || message === "退出失败"
    ? "alert"
    : "status";

  return (
    <ProductShell
      active="login"
      title="登录"
      lede="邮箱和密码会交给本机 API。会话放在 HttpOnly Cookie 里，页面脚本读不到。"
      status={message}
      statusRole={statusRole}
    >
      {user ? (
        <section className="ps-card">
          <h2>当前账户</h2>
          <p style={{ margin: "0.75rem 0 0" }}>{user.email}</p>
          <p className="ps-session">{user.id}</p>
          <div className="ps-inline-links">
            <Link href="/library">进入照片库</Link>
            {" · "}
            <Link href="/albums">管理相册与分享</Link>
          </div>
          <div className="ps-actions">
            <button type="button" className="ps-secondary" onClick={() => void logout()}>
              退出
            </button>
          </div>
        </section>
      ) : (
        <form
          className="ps-card"
          onSubmit={(event) => {
            event.preventDefault();
            void submit("/api/v1/auth/login");
          }}
        >
          <h2>邮箱登录</h2>
          <label className="ps-field">
            邮箱
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="ps-field">
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
          <div className="ps-actions">
            <button type="submit" className="ps-primary">登录</button>
            <button
              type="button"
              className="ps-secondary"
              onClick={() => void submit("/api/v1/auth/register")}
            >
              注册
            </button>
          </div>
        </form>
      )}
    </ProductShell>
  );
}
