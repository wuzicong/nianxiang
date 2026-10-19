"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { safeUserMessage } from "../../lib/album-assets";

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

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/">念册 · Memora</a>
      </p>
      <h1 style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>登录</h1>
      <p style={{ lineHeight: 1.6, color: "#555" }}>
        邮箱和密码会交给本机 API。会话放在 HttpOnly Cookie 里，页面脚本读不到。
      </p>
      <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 14 }}>{message}</p>
      {user ? (
        <section style={{ marginTop: "1.5rem" }}>
          <p>
            {user.email}
            <br />
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{user.id}</span>
          </p>
          <p style={{ marginTop: "0.75rem" }}>
            <a href="/library">进入照片库</a>
            {" · "}
            <a href="/albums">管理相册与分享</a>
          </p>
          <button type="button" onClick={() => void logout()}>
            退出
          </button>
        </section>
      ) : (
        <form
          style={{ display: "grid", gap: "0.75rem", maxWidth: 360, marginTop: "1.5rem" }}
          onSubmit={(event) => {
            event.preventDefault();
            void submit("/api/v1/auth/login");
          }}
        >
          <label>
            邮箱
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              style={{ display: "block", width: "100%", marginTop: 4, padding: "0.4rem" }}
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              style={{ display: "block", width: "100%", marginTop: 4, padding: "0.4rem" }}
            />
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="submit">登录</button>
            <button type="button" onClick={() => void submit("/api/v1/auth/register")}>
              注册
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
