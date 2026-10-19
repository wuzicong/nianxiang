"use client";

import { THEME_IDS } from "@memora/shared";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createAlbum, listAlbums, type AlbumSummary } from "../../lib/albums-api";
import { themeSkin } from "../../lib/themes";
import { ProductShell } from "../product-shell/product-shell";

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

  const needsLogin = message === "请先登录。";

  return (
    <ProductShell
      active="albums"
      title="相册"
      lede="在这里建相册、上传照片，并生成可撤销的分享链接。设密码的链接在打开时会先要求输入密码。打开某本相册后可以按主题看故事或翻页，用的是预览图。想先看版式，打开主题样张，那里用的是示例照片。"
      status={message}
      statusRole={needsLogin || message.includes("不可达") ? "alert" : "status"}
    >
      {needsLogin ? (
        <p className="ps-inline-links">
          请先<Link href="/login">登录</Link>。
        </p>
      ) : null}

      <form
        className="ps-card ps-card-wide"
        onSubmit={(event) => {
          event.preventDefault();
          void submitCreate();
        }}
      >
        <h2>新建相册</h2>
        <p className="ps-muted" style={{ marginTop: "0.45rem" }}>
          主路径建议在<Link href="/library">照片库</Link>选片后建册；此处保留无选片快速创建。
        </p>
        <label className="ps-field">
          标题
          <input
            type="text"
            required
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={needsLogin}
          />
        </label>
        <label className="ps-field">
          主题
          <select
            value={themeId}
            onChange={(event) => setThemeId(event.target.value)}
            disabled={needsLogin}
          >
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
        <div className="ps-actions">
          <button type="submit" className="ps-primary" disabled={pending || needsLogin}>
            {pending ? "提交中…" : "创建相册"}
          </button>
          <Link className="ps-secondary" href="/preview">主题样张</Link>
        </div>
      </form>

      {albums.length > 0 ? (
        <ul className="ps-album-list">
          {albums.map((album) => (
            <li key={album.albumId} className="ps-album-item">
              <Link href={`/albums/${album.albumId}`}>{album.title}</Link>
              <span className="ps-album-meta">
                {themeSkin(album.themeId).name} · {album.assetCount} 张 ·{" "}
                <Link href={`/albums/${album.albumId}/preview`}>成册预览</Link>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </ProductShell>
  );
}
