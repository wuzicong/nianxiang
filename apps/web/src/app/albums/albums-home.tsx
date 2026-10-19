"use client";

import { THEME_IDS, type ThemeId } from "@memora/shared";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LibraryDecor } from "../../lib/library-decor";
import { createAlbum, listAlbums, type AlbumSummary } from "../../lib/albums-api";
import { themeSkin } from "../../lib/themes";
import { useSessionEmail } from "../../lib/use-session-email";
import { MemoraShell } from "../shell/memora-shell";

export function AlbumsHome({ decorations }: { decorations: Record<string, string> }) {
  const sessionEmail = useSessionEmail();
  const createRef = useRef<HTMLFormElement>(null);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [title, setTitle] = useState("");
  const [themeId, setThemeId] = useState<ThemeId>(THEME_IDS[0]);
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
    setMessage(result.albums.length === 0 ? "" : `共 ${result.albums.length} 本相册。`);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setMessage("API 暂时不可达"));
  }, [refresh]);

  async function submitCreate() {
    if (pending) return;
    setPending(true);
    setMessage("创建中…");
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
  const empty = !needsLogin && albums.length === 0 && message !== "正在加载…";

  const lede = (
    <>
      在这里管理相册与分享。相册默认只有你能看到。也可从照片库选片做成主题册。想先看版式，打开{" "}
      <Link href="/preview">主题样张</Link>
      。想从照片里做成册，去照片库多选后点「做成主题相册」。
    </>
  );

  return (
    <MemoraShell
      active="albums"
      title="相册"
      lede={lede}
      status={message || undefined}
      statusRole={needsLogin || message.includes("不可达") ? "alert" : "status"}
      userEmail={sessionEmail}
      privacyBadge="相册默认私密"
    >
      {needsLogin ? (
        <p className="shell-inline-links">
          请先<Link href="/login?next=/albums">登录</Link>。
        </p>
      ) : null}

      <form
        ref={createRef}
        id="album-create-form"
        className="shell-card shell-card--wide"
        onSubmit={(event) => {
          event.preventDefault();
          void submitCreate();
        }}
      >
        <h2>新建相册</h2>
        <label className="shell-field">
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
        <label className="shell-field">
          主题
          <select
            value={themeId}
            onChange={(event) => setThemeId(event.target.value as ThemeId)}
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
        <div className="shell-actions">
          <button type="submit" className="lib-primary" disabled={pending || needsLogin}>
            {pending ? "创建中…" : "创建相册"}
          </button>
        </div>
      </form>

      {empty ? (
        <section className="shell-empty lib-empty-library" aria-labelledby="albums-empty-title">
          <div className="shell-empty-art lib-empty-art" aria-hidden="true">
            <LibraryDecor svg={decorations["soft-blob"] ?? null} className="lib-decor-bg" />
            <LibraryDecor svg={decorations.envelope ?? null} className="lib-decor-fg" />
          </div>
          <h2 id="albums-empty-title">还没有相册</h2>
          <p className="shell-muted">
            建一本空册后上传，或去照片库选片直接做成主题相册。
          </p>
          <div className="shell-actions">
            <button
              type="button"
              className="lib-primary"
              onClick={() => createRef.current?.querySelector<HTMLInputElement>("input")?.focus()}
            >
              新建一本
            </button>
            <Link className="lib-quiet" href="/library">去照片库</Link>
          </div>
        </section>
      ) : null}

      {albums.length > 0 ? (
        <ul className="shell-album-list">
          {albums.map((album) => (
            <li key={album.albumId} className="shell-album-item">
              <Link href={`/albums/${album.albumId}`}>{album.title}</Link>
              <span className="shell-album-meta">
                {themeSkin(album.themeId).name} · {album.assetCount} 张 ·{" "}
                <Link className="lib-quiet" href={`/albums/${album.albumId}/preview`}>成册预览</Link>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </MemoraShell>
  );
}
