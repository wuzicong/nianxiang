"use client";

import { THEME_IDS } from "@memora/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createAlbum, listAlbums, type AlbumSummary } from "../../lib/albums-api";
import { themeSkin } from "../../lib/themes";

const fieldStyle = { display: "block", width: "100%", marginTop: 4, padding: "0.4rem" };

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [title, setTitle] = useState("");
  const [themeId, setThemeId] = useState<string>(THEME_IDS[0]);
  const [message, setMessage] = useState("正在加载…");
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const result = await listAlbums();
    if (!result.ok && result.status === 401) {
      setAlbums([]);
      setMessage("请先登录。");
      return;
    }
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setAlbums(result.albums);
    setMessage(result.albums.length === 0 ? "还没有相册。" : `共 ${result.albums.length} 本相册。`);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setMessage("API 暂时不可达"));
  }, [refresh]);

  async function submitCreate() {
    if (pending) return;
    setPending(true);
    setMessage("正在创建…");
    try {
      const result = await createAlbum({ title, themeId });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setTitle("");
      setMessage("相册已创建。");
      await refresh();
    } catch {
      setMessage("API 暂时不可达");
    } finally {
      setPending(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <Link href="/">念册 · Memora</Link>
        {" · "}
        <Link href="/library">照片库</Link>
        {" · "}
        <Link href="/login">登录</Link>
      </p>
      <h1 style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>相册</h1>
      <p style={{ lineHeight: 1.6, color: "#555" }}>
        在这里建相册、上传照片，并生成可撤销的分享链接。设密码的链接在打开时会先要求输入密码。
        打开某本相册后可以按主题看故事或翻页，用的是预览图。想先看版式，打开{" "}
        <Link href="/preview">主题样张</Link>
        ，那里用的是示例照片。
      </p>
      <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 14 }}>{message}</p>

      <form
        style={{ display: "grid", gap: "0.75rem", maxWidth: 420, marginTop: "1.5rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          void submitCreate();
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>新建相册</h2>
        <label>
          标题
          <input
            type="text"
            required
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            style={fieldStyle}
          />
        </label>
        <label>
          主题
          <select value={themeId} onChange={(event) => setThemeId(event.target.value)} style={fieldStyle}>
            {THEME_IDS.map((id) => {
              const skin = themeSkin(id);
              return (
                <option key={id} value={id}>
                  {skin.name}
                </option>
              );
            })}
          </select>
        </label>
        <button type="submit" disabled={pending}>{pending ? "提交中…" : "创建相册"}</button>
      </form>

      {albums.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, marginTop: "2rem" }}>
          {albums.map((album) => (
            <li key={album.albumId} style={{ marginBottom: "0.75rem" }}>
              <Link href={`/albums/${album.albumId}`}>{album.title}</Link>
              <span style={{ color: "#777", fontSize: 14 }}>
                {" "}
                · {themeSkin(album.themeId).name} · {album.assetCount} 张 ·{" "}
                <Link href={`/albums/${album.albumId}/preview`}>成册预览</Link>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
