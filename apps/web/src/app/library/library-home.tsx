"use client";

/**
 * 照片库首页。后续接手先看这几条：
 * - 数据来自 GET /api/v1/assets。响应只有衍生图预览、拍摄时间和上传时间，没有原图键，也没有 GPS。
 * - 「时间」用 capturedAt 的日期；没有拍摄时间就用 createdAt。分组逻辑在 src/lib/library.ts，有测试。
 * - 「地点 / 场景 / 人物」是空态。仓库里没有地名、场景或人脸结果，不要填假数据。
 *   以后地点只能展示地理编码写回的名字，不能把坐标发到浏览器。
 * - 多选：点击切换，Shift 从锚点加选一段，触摸长按进入选择。上限 200，和相册容量一致。
 * - 生成相册复用 POST /api/v1/albums，再按 50 张一批 POST /api/v1/albums/:id/assets，然后去 /albums/:id/preview。
 *   放入照片失败时没有改相册或移除照片的接口，所以标题和主题会锁住，重试只继续放入刚才那一批。
 * - TODO(前端大神): 上传不要在这页重做。PR #14 的 UploadPhotos
 *   （apps/web/src/app/albums/upload-photos.tsx）仍然必须带 albumId，并会把照片加入那本相册。
 *   等它合并、且能脱离相册复用之后，再替换下面的「去相册上传」。
 */

import { THEME_IDS, type ThemeId } from "@memora/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetNeedsRefresh } from "../../lib/album-assets";
import { createThemedAlbum, listLibrary } from "../../lib/library-api";
import {
  applyPhotoSelection,
  chronologicalAssetIds,
  flattenGroupIds,
  groupPhotosByTime,
  LIBRARY_SELECTION_LIMIT,
  libraryRefreshDelay,
  suggestedAlbumTitle,
  type LibraryPhoto,
} from "../../lib/library";
import { LibraryCreateDialog } from "./library-create-dialog";
import { LibraryGrid } from "./library-grid";

type Phase = "loading" | "guest" | "error" | "ready";
type Tab = "time" | "place" | "scene" | "people";

const TABS: { id: Tab; label: string }[] = [
  { id: "time", label: "时间" },
  { id: "place", label: "地点" },
  { id: "scene", label: "场景" },
  { id: "people", label: "人物" },
];

const SHELLS: Record<Exclude<Tab, "time">, { title: string; body: string }> = {
  place: {
    title: "地点还在路上",
    body: "地名要等地理编码，跑在你自己的机器或自托管服务上。浏览器不会收到 GPS 坐标，所以这里没有地图，也没有占位城市。这不是「零张照片属于某地」，而是分组数据还不存在。",
  },
  scene: {
    title: "场景还没被认出来",
    body: "夜色、室内、海边这类分组要等自托管的场景模型。模型还没接上，这里不会编一组假场景。",
  },
  people: {
    title: "人物还没出现",
    body: "人脸会在设备上或自托管服务里聚类。这一阶段没有人物数据，也不会显示猜出来的面孔或名字。",
  },
};

export function LibraryHome() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("照片库暂时打不开");
  const [email, setEmail] = useState<string | null>(null);
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState<Tab>("time");
  const [timeZone, setTimeZone] = useState("UTC");
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [capped, setCapped] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(THEME_IDS[0]);
  const [pending, setPending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draftAlbumId, setDraftAlbumId] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const brokenPreviews = useRef(new Set<string>());

  const load = useCallback(async (mode: "initial" | "silent") => {
    if (mode === "initial") setPhase("loading");
    try {
      const [meResponse, listed] = await Promise.all([
        fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" }),
        listLibrary(),
      ]);
      if (meResponse.ok) {
        const me = (await meResponse.json()) as { user?: { email?: string } };
        setEmail(typeof me.user?.email === "string" ? me.user.email : null);
      } else {
        setEmail(null);
      }
      if (!listed.ok && listed.status === 401) {
        setPhotos([]);
        setPhase("guest");
        return;
      }
      if (!listed.ok) {
        if (mode === "initial") {
          setError(listed.message);
          setPhase("error");
        }
        return;
      }
      setPhotos(listed.photos);
      setHasMore(listed.hasMore);
      setPhase("ready");
    } catch {
      if (mode === "initial") {
        setError("API 暂时不可达");
        setPhase("error");
      }
    }
  }, []);

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) setTimeZone(zone);
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    if (phase !== "ready") return;
    const delay = libraryRefreshDelay(photos);
    if (delay === null) return;
    const timer = window.setTimeout(() => {
      void load("silent");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [phase, photos, load]);

  useEffect(() => {
    const live = new Set(photos.map((photo) => photo.assetId));
    setSelected((current) => current.filter((id) => live.has(id)));
  }, [photos]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || composerOpen) return;
      if (!selecting && selected.length === 0) return;
      setSelecting(false);
      setSelected([]);
      setAnchor(null);
      setCapped(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composerOpen, selecting, selected.length]);

  const orderedIds = useMemo(
    () => flattenGroupIds(groupPhotosByTime(photos, timeZone)),
    [photos, timeZone],
  );

  function selectPhoto(id: string, shift: boolean, gesture: "toggle" | "add") {
    if (draftAlbumId) {
      setDraftAlbumId(null);
      setDraftIds(null);
      setCreateError(null);
    }
    const next = applyPhotoSelection({ selected, orderedIds, id, shift, anchor, gesture });
    setSelected(next.selected);
    setAnchor(next.anchor);
    setCapped(next.capped);
    if (gesture === "add" || next.selected.length > 0) setSelecting(true);
    if (next.selected.length === 0) setSelecting(false);
  }

  function clearSelection() {
    setSelecting(false);
    setSelected([]);
    setAnchor(null);
    setCapped(false);
  }

  function openComposer() {
    if (!titleDirty && !draftAlbumId) {
      const chosen = photos.filter((photo) => selected.includes(photo.assetId));
      setTitle(suggestedAlbumTitle(chosen, timeZone));
    }
    setComposerOpen(true);
  }

  async function submitAlbum() {
    if (pending) return;
    const ids = draftIds ?? chronologicalAssetIds(photos, selected, timeZone);
    setPending(true);
    setCreateError(null);
    try {
      const result = await createThemedAlbum({
        title,
        themeId,
        assetIds: ids,
        albumId: draftAlbumId,
      });
      if (!result.ok) {
        if (result.albumId) {
          setDraftAlbumId(result.albumId);
          setDraftIds(ids);
        }
        setCreateError(result.message);
        return;
      }
      router.push(`/albums/${result.albumId}/preview`);
    } catch {
      setCreateError("API 暂时不可达");
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
  }

  function onTabKey(event: React.KeyboardEvent) {
    const index = TABS.findIndex((item) => item.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const id = TABS[next]?.id;
    if (!id) return;
    setTab(id);
    document.getElementById(`tab-${id}`)?.focus();
  }

  const processing = photos.some((photo) => assetNeedsRefresh(photo.status));
  const showDock = selecting || selected.length > 0;
  const shell = tab === "time" ? null : SHELLS[tab];
  const live = capped
    ? `一次最多选择 ${LIBRARY_SELECTION_LIMIT} 张`
    : selected.length > 0
      ? `已选 ${selected.length} 张`
      : "";

  return (
    <div className="lib">
      <div className="lib-bg" aria-hidden="true" />
      <a className="lib-skip" href="#library-main">
        跳到内容
      </a>
      <header className="lib-top">
        <div className="lib-wrap lib-top-inner">
          <Link className="lib-mark" href="/">
            <span className="lib-mark-en">Memora</span>
            <span className="lib-mark-zh">念册</span>
          </Link>
          <nav className="lib-nav" aria-label="主导航">
            <Link href="/library" aria-current="page">
              照片库
            </Link>
            <Link href="/albums">相册</Link>
            {email ? (
              <button type="button" onClick={() => void logout()} aria-label={`退出 ${email}`}>
                {email} · 退出
              </button>
            ) : (
              <Link href="/login">登录</Link>
            )}
          </nav>
        </div>
      </header>
      <main className="lib-wrap lib-main" id="library-main">
        <p className="lib-kicker">library</p>
        <h1>照片库</h1>
        <p className="lib-hand">把日子摊开</p>
        <p className="lib-lede">
          按拍摄日期排成一墙。选中几张，套上棉花糖、纸灯或杂志，去看这本册子。
        </p>
        <p className="lib-note">页面只显示预览。原图和坐标不会到浏览器里。</p>

        <div className="lib-toolbar">
          <div role="tablist" aria-label="分组" className="lib-tabs" onKeyDown={onTabKey}>
            {TABS.map((item) => (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                type="button"
                role="tab"
                className="lib-tab"
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="lib-select"
            aria-pressed={selecting}
            disabled={phase !== "ready" || photos.length === 0}
            onClick={() => setSelecting((current) => !current)}
          >
            {selecting ? "完成选择" : "选择"}
          </button>
        </div>
        <p className="lib-hint" id="library-select-hint">
          点选或按空格选择。按住 Shift 可连续加选。触摸时长按进入选择。
        </p>
        <p className="lib-sr" aria-live="polite">
          {live}
        </p>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} aria-busy={phase === "loading"}>
          {phase === "loading" ? (
            <>
              <div className="lib-skeletons" aria-hidden="true">
                <span className="lib-skel" />
                <span className="lib-skel" />
                <span className="lib-skel" />
              </div>
              <p className="lib-status" role="status">
                正在把照片按日期排开…
              </p>
            </>
          ) : null}

          {phase === "guest" ? (
            <section className="lib-empty">
              <h2>先登录，再翻你的册子</h2>
              <p>照片只属于当前账号。登录之后，这里会按拍摄日期排开你的预览。</p>
              <p>
                <Link className="lib-primary lib-link" href="/login">
                  登录
                </Link>
              </p>
            </section>
          ) : null}

          {phase === "error" ? (
            <section className="lib-empty">
              <h2>这一页没有打开</h2>
              <p role="alert">{error}</p>
              <button type="button" className="lib-primary" onClick={() => void load("initial")}>
                再试一次
              </button>
            </section>
          ) : null}

          {phase === "ready" && shell ? (
            <section className={`lib-shell lib-shell-${tab}`} aria-labelledby={`shell-${tab}`}>
              <div className={`lib-shell-art lib-shell-art-${tab}`} aria-hidden="true" />
              <p className="lib-shell-seal">尚未接入</p>
              <h2 id={`shell-${tab}`}>{shell.title}</h2>
              <p>{shell.body}</p>
            </section>
          ) : null}

          {phase === "ready" && tab === "time" && photos.length === 0 ? (
            <section className="lib-empty">
              <h2>还是空白的一页</h2>
              <p>到相册里上传之后，预览会回到这里。处理中的照片会先占一个位置。原图不会进这个页面。</p>
              {/* TODO(前端大神): PR #14 合并后复用 UploadPhotos。它现在必须带 albumId。不要在照片库另写上传。 */}
              <p>
                <Link className="lib-primary lib-link" href="/albums">
                  去相册上传
                </Link>
              </p>
            </section>
          ) : null}

          {phase === "ready" && tab === "time" && photos.length > 0 ? (
            <>
              <p className="lib-count">
                {photos.length} 张
                {processing ? " · 有照片还在生成预览" : ""}
                {hasMore ? " · 先显示最近上传的一部分，更早的还在库里" : ""}
              </p>
              {draftAlbumId ? (
                <p className="lib-draft">
                  有一本相册还没放完刚才选中的照片。改选择会另开一本，已经建立的那本目前不能在这里删除。
                </p>
              ) : null}
              <LibraryGrid
                photos={photos}
                timeZone={timeZone}
                selected={selected}
                selecting={selecting}
                focusId={focusId}
                locked={pending}
                onFocus={setFocusId}
                onToggle={selectPhoto}
                onClear={clearSelection}
                onPreviewError={(src) => {
                  if (brokenPreviews.current.has(src)) return;
                  brokenPreviews.current.add(src);
                  void load("silent");
                }}
              />
            </>
          ) : null}
        </div>
      </main>

      {showDock ? (
        <div className="lib-dock" role="region" aria-label="已选照片">
          <div className="lib-dock-inner">
            <strong>{selected.length > 0 ? `已选 ${selected.length} 张` : "点一张照片"}</strong>
            <div className="lib-dock-actions">
              <button type="button" className="lib-quiet" onClick={clearSelection}>
                取消
              </button>
              <button
                type="button"
                className="lib-primary"
                disabled={selected.length < 1 || pending}
                onClick={openComposer}
              >
                生成相册
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LibraryCreateDialog
        open={composerOpen}
        pending={pending}
        locked={Boolean(draftAlbumId)}
        title={title}
        themeId={themeId}
        count={(draftIds ?? selected).length}
        error={createError}
        albumHref={draftAlbumId ? `/albums/${draftAlbumId}` : null}
        onTitle={(value) => {
          setTitleDirty(true);
          setTitle(value);
        }}
        onTheme={setThemeId}
        onClose={() => {
          if (!pending) setComposerOpen(false);
        }}
        onSubmit={() => void submitAlbum()}
      />
    </div>
  );
}
