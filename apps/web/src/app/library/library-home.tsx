"use client";

/**
 * 图库首页（/library）。工具页固定 cotton-candy 的 --share-* 皮肤；建册弹层里的主题卡各自包 share-shell。
 * 数据：GET /api/v1/assets（takenAt / uploadedAt + 衍生图）。上传复用 UploadPhotos，target.kind = library。
 * 建册：createAlbum({ title, themeId, assetIds })（见 albums-api.ts）。
 */

import { DEFAULT_THEME_ID, THEME_IDS, type ThemeId } from "@memora/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { assetNeedsRefresh, safeUserMessage, type AlbumAssetView } from "../../lib/album-assets";
import { createThemedAlbum, listLibrary } from "../../lib/library-api";
import {
  applyPhotoSelection,
  chronologicalAssetIds,
  composeCoverPhoto,
  flattenGroupIds,
  groupPhotosByTime,
  LIBRARY_SELECTION_LIMIT,
  libraryLightboxIds,
  libraryPhotoSelectable,
  libraryRefreshDelay,
  type LibraryPhoto,
} from "../../lib/library";
import { generateMockLibraryPhotos } from "../../lib/library-mock";
import { LibraryDecor } from "../../lib/library-decor";
import { themeSkin } from "../../lib/themes";
import "../albums/album-upload.css";
import { shareThemeStyle } from "../s/share-chrome";
import { defaultComposeTitle, LibraryCreateDialog } from "./library-create-dialog";
import { LibraryGrid } from "./library-grid";
import { LibraryLightbox } from "./library-lightbox";
import { LibraryUploadWorkbench } from "./library-upload-workbench";
import type { UploadQueueSnapshot } from "../albums/upload-photos";

type Phase = "loading" | "guest" | "error" | "ready";
type Tab = "time" | "place" | "scene" | "people";

const TABS: { id: Tab; label: string; soon?: boolean }[] = [
  { id: "time", label: "时间" },
  { id: "place", label: "地点", soon: true },
  { id: "scene", label: "场景", soon: true },
  { id: "people", label: "人物", soon: true },
];

const SHELLS: Record<Exclude<Tab, "time">, { title: string; body: string; decor: "envelope" | "sparkle" | "soft-blob" }> =
  {
    place: {
      title: "地点整理还在路上",
      body: "我们会在你的设备或服务器上本地识别拍摄地点，不会把位置发给第三方。准备好之前，这里先空着。",
      decor: "envelope",
    },
    scene: {
      title: "场景识别还在路上",
      body: "之后会按夜景、海边、美食这类场景自动归类。现在还没有分析任何照片。",
      decor: "sparkle",
    },
    people: {
      title: "人物识别还在路上",
      body: "人脸识别默认关闭，开启前会单独问你。现在没有识别任何人。",
      decor: "soft-blob",
    },
  };

const shellSkin = themeSkin(DEFAULT_THEME_ID);

const DESKTOP_SELECTION_MQ = "(min-width: 1280px)";

function subscribeDesktopSelection(onStoreChange: () => void) {
  const mq = window.matchMedia(DESKTOP_SELECTION_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getDesktopSelection() {
  return window.matchMedia(DESKTOP_SELECTION_MQ).matches;
}

function getDesktopSelectionServer() {
  return false;
}

export function LibraryHome({
  decorations,
}: {
  decorations: Record<string, string>;
}) {
  const router = useRouter();
  const uploadTriggerRef = useRef<HTMLButtonElement>(null);
  const composeTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopSelectionBar = useSyncExternalStore(
    subscribeDesktopSelection,
    getDesktopSelection,
    getDesktopSelectionServer,
  );
  const uploadQueueRef = useRef<UploadQueueSnapshot>({
    waiting: 0,
    uploading: 0,
    processing: 0,
    done: 0,
    failed: 0,
    total: 0,
    hasActive: false,
  });
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("照片暂时没加载出来。");
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
  const [composeStep, setComposeStep] = useState<"theme" | "title">("theme");
  const [title, setTitle] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(THEME_IDS[0]);
  const [pending, setPending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draftAlbumId, setDraftAlbumId] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const [uploadWorkbenchOpen, setUploadWorkbenchOpen] = useState(false);
  const [uploadCollapsed, setUploadCollapsed] = useState(false);
  const [pageDrag, setPageDrag] = useState(false);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const brokenPreviews = useRef(new Set<string>());
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const lightboxReturnRef = useRef<string | null>(null);

  const load = useCallback(async (mode: "initial" | "silent") => {
    if (mode === "initial") setPhase("loading");
    const mockFromQuery =
      typeof window !== "undefined"
        ? Number(new URLSearchParams(window.location.search).get("libraryMock") || "0")
        : 0;
    const mockCount = mockFromQuery || Number(process.env.NEXT_PUBLIC_LIBRARY_MOCK_COUNT || "0");
    if (mockCount > 0) {
      setPhotos(generateMockLibraryPhotos(mockCount));
      setHasMore(false);
      setPhase("ready");
      return;
    }
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
        router.push("/login?next=/library");
        return;
      }
      if (!listed.ok) {
        if (mode === "initial") {
          setError(safeUserMessage(listed.message, "照片暂时没加载出来。"));
          setPhase("error");
        }
        return;
      }
      setPhotos(listed.photos);
      setHasMore(listed.hasMore);
      setPhase("ready");
    } catch {
      if (mode === "initial") {
        setError("网络好像断了。");
        setPhase("error");
      }
    }
  }, [router]);

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) setTimeZone(zone);
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const openUploadWorkbench = useCallback(() => {
    setUploadWorkbenchOpen(true);
    setUploadCollapsed(false);
  }, []);

  const dismissUploadWorkbench = useCallback(() => {
    setUploadWorkbenchOpen(false);
    setUploadCollapsed(false);
    uploadTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    const delay = libraryRefreshDelay(photos);
    if (delay === null) return;
    const timer = window.setTimeout(() => void load("silent"), delay);
    return () => window.clearTimeout(timer);
  }, [phase, photos, load]);

  useEffect(() => {
    const live = new Set(photos.map((photo) => photo.assetId));
    setSelected((current) => current.filter((id) => live.has(id)));
  }, [photos]);

  useEffect(() => {
    const on = () => {
      setOffline(false);
      setToast("已重新连上");
      window.setTimeout(() => setToast(null), 2000);
    };
    const off = () => setOffline(true);
    setOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const lightboxOrderedIds = useMemo(
    () => libraryLightboxIds(photos, timeZone),
    [photos, timeZone],
  );

  const photosById = useMemo(() => new Map(photos.map((photo) => [photo.assetId, photo])), [photos]);

  const closeLightbox = useCallback(() => {
    setLightboxId(null);
    const returnId = lightboxReturnRef.current;
    lightboxReturnRef.current = null;
    if (!returnId) return;
    window.requestAnimationFrame(() => {
      const escaped = CSS.escape(returnId);
      document.querySelector<HTMLButtonElement>(`[data-asset-id="${escaped}"]`)?.focus();
    });
  }, []);

  const openLightbox = useCallback(
    (id: string) => {
      if (!lightboxOrderedIds.includes(id)) return;
      lightboxReturnRef.current = id;
      setLightboxId(id);
    },
    [lightboxOrderedIds],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "u" || event.key === "U") {
        event.preventDefault();
        openUploadWorkbench();
      }
      if (event.key !== "Escape" || composerOpen) return;
      if (uploadWorkbenchOpen && !uploadCollapsed) {
        event.preventDefault();
        setUploadCollapsed(true);
        return;
      }
      if (lightboxId) {
        event.preventDefault();
        closeLightbox();
        return;
      }
      if (!selecting && selected.length === 0) return;
      setSelecting(false);
      setSelected([]);
      setAnchor(null);
      setCapped(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    closeLightbox,
    composerOpen,
    lightboxId,
    openUploadWorkbench,
    selecting,
    selected.length,
    uploadCollapsed,
    uploadWorkbenchOpen,
  ]);

  const orderedIds = useMemo(
    () => flattenGroupIds(groupPhotosByTime(photos, timeZone)).filter((id) => {
      const photo = photos.find((p) => p.assetId === id);
      return photo ? libraryPhotoSelectable(photo) : false;
    }),
    [photos, timeZone],
  );

  const uploadAssets: AlbumAssetView[] = useMemo(
    () =>
      photos.map((p) => ({
        assetId: p.assetId,
        filename: p.filename,
        status: p.status,
        width: p.width,
        height: p.height,
        error: p.error,
        takenAt: p.takenAt,
        previews: p.previews,
      })),
    [photos],
  );

  function selectPhoto(id: string, shift: boolean, gesture: "toggle" | "add") {
    const photo = photos.find((p) => p.assetId === id);
    if (!photo || !libraryPhotoSelectable(photo)) return;
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

  function selectDay(ids: string[], select: boolean) {
    if (select) {
      const merged = [...new Set([...selected, ...ids])].slice(0, LIBRARY_SELECTION_LIMIT);
      setSelected(merged);
      setSelecting(true);
      setCapped(merged.length >= LIBRARY_SELECTION_LIMIT);
    } else {
      const remove = new Set(ids);
      setSelected(selected.filter((id) => !remove.has(id)));
    }
  }

  function clearSelection() {
    setSelecting(false);
    setSelected([]);
    setAnchor(null);
    setCapped(false);
  }

  function openComposer() {
    setComposeStep("theme");
    if (!titleDirty && !draftAlbumId) {
      setTitle(defaultComposeTitle(themeId));
    }
    setComposerOpen(true);
  }

  async function submitAlbum() {
    if (pending || offline) return;
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
        if (result.attachFailed && result.albumId) {
          setDraftAlbumId(result.albumId);
          setDraftIds(ids);
          setCreateError("相册建好了，但照片没放进去。请重试放入。");
        } else if (result.albumId) {
          setDraftAlbumId(result.albumId);
          setDraftIds(ids);
          setCreateError(result.message);
        } else {
          setCreateError(result.status === 401 ? "登录已过期，请重新登录" : result.message);
        }
        return;
      }
      setComposerOpen(false);
      clearSelection();
      setToast(`已建好「${title.trim()}」，共 ${ids.length} 张`);
      router.push(`/albums/${result.albumId}/preview?focus=title`);
    } catch {
      setCreateError("网络好像断了，选择还在，连上后再点一次");
    } finally {
      setPending(false);
    }
  }

  const processing = photos.some((photo) => assetNeedsRefresh(photo.status));
  const showSelectionBar = selecting || selected.length > 0;
  const shell = tab === "time" ? null : SHELLS[tab];
  const coverPhoto = useMemo(
    () => composeCoverPhoto(photos, draftIds ?? selected, timeZone),
    [photos, draftIds, selected, timeZone],
  );
  const live = capped
    ? "一次最多 200 张，先挑最想放进去的"
    : selected.length > 0
      ? `已选 ${selected.length} 张`
      : selecting
        ? "已选 0 张"
        : toast ?? "";

  const selectionBarInner = (
    <>
      <button type="button" className="lib-quiet" onClick={clearSelection}>✕ 取消</button>
      <strong aria-live="polite">{live}</strong>
      <button
        ref={composeTriggerRef}
        type="button"
        className="lib-primary"
        disabled={selected.length < 1 || pending || offline || capped}
        onClick={openComposer}
      >
        做成主题相册
      </button>
    </>
  );

  const selectionBar = showSelectionBar ? (
    desktopSelectionBar ? (
      <header className="lib-selection-bar lib-selection-bar-top" role="region" aria-label="已选照片">
        {selectionBarInner}
      </header>
    ) : (
      <div className="lib-selection-bar lib-selection-bar-bottom" role="region" aria-label="已选照片">
        {selectionBarInner}
      </div>
    )
  ) : null;

  const defaultTopHeader = (
    <header className="lib-top">
      <div className="lib-wrap lib-top-inner">
        <Link className="lib-mark" href="/">念册 · Memora</Link>
        <span className="lib-privacy-badge" title="仅你可见">🔒 仅你可见</span>
        <div className="lib-top-actions">
          <button
            ref={uploadTriggerRef}
            type="button"
            className="lib-primary"
            disabled={offline || phase !== "ready"}
            onClick={openUploadWorkbench}
          >
            上传
          </button>
          {email ? (
            <button type="button" className="lib-quiet" onClick={() => void fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).then(() => router.push("/login"))}>
              退出
            </button>
          ) : (
            <Link href="/login">登录</Link>
          )}
        </div>
      </div>
    </header>
  );

  const topChrome =
    showSelectionBar && desktopSelectionBar
      ? selectionBar
      : !showSelectionBar
        ? defaultTopHeader
        : null;

  return (
    <div
      className="lib share-shell"
      data-theme={shellSkin.id}
      style={shareThemeStyle(shellSkin)}
      onDragEnter={(event) => {
        if (event.dataTransfer?.types.includes("Files")) setPageDrag(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setPageDrag(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setPageDrag(false);
        openUploadWorkbench();
      }}
      onDragOver={(event) => event.preventDefault()}
    >
      {pageDrag ? (
        <div className="lib-page-drop" role="status">松手上传到图库</div>
      ) : null}
      {offline ? (
        <p className="lib-offline" role="status">
          现在离线。能看已加载的照片，联网后再上传或建相册。
        </p>
      ) : null}

      <a className="lib-skip" href="#library-main">跳到内容</a>

      {topChrome}

      <div className="lib-tabs-wrap">
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
              {item.soon ? <span className="lib-soon">即将</span> : null}
            </button>
          ))}
        </div>
      </div>

      <main className="lib-wrap lib-main" id="library-main">
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} aria-busy={phase === "loading"}>
          {phase === "loading" ? (
            <>
              <div className="lib-skeletons" aria-hidden="true">
                <span className="lib-skel lib-skel-bar" />
                <span className="lib-skel lib-skel-bar short" />
                <div className="lib-skel-grid">
                  {Array.from({ length: 18 }).map((_, i) => (
                    <span key={i} className="lib-skel" />
                  ))}
                </div>
              </div>
              <p className="lib-sr" role="status">正在加载照片</p>
            </>
          ) : null}

          {phase === "guest" ? (
            <section className="lib-empty">
              <h2>先登录</h2>
              <Link className="lib-primary lib-link" href="/login?next=/library">登录</Link>
            </section>
          ) : null}

          {phase === "error" ? (
            <section className="lib-empty lib-empty-load-error">
              <h2>{error}</h2>
              <button type="button" className="lib-primary" onClick={() => void load("initial")}>重试</button>
            </section>
          ) : null}

          {phase === "ready" && shell ? (
            <section className="lib-shell" aria-labelledby={`shell-${tab}`}>
              <div className="lib-shell-art">
                <LibraryDecor svg={decorations[shell.decor] ?? null} className="lib-decor-main" />
              </div>
              <h2 id={`shell-${tab}`}>{shell.title}</h2>
              <p>{shell.body}</p>
              <button type="button" className="lib-primary" onClick={() => setTab("time")}>回到时间</button>
            </section>
          ) : null}

          {phase === "ready" && tab === "time" && photos.length === 0 ? (
            <section className="lib-empty lib-empty-library">
              <div className="lib-empty-art">
                <LibraryDecor svg={decorations["soft-blob"] ?? null} className="lib-decor-bg" />
                <LibraryDecor svg={decorations.envelope ?? null} className="lib-decor-fg" />
              </div>
              <h2>这里还空着</h2>
              <p>把照片放进来，念册会按时间帮你排好。只有你能看到。</p>
              <button type="button" className="lib-primary" disabled={offline} onClick={openUploadWorkbench}>
                上传第一批照片
              </button>
              <p className="lib-empty-secondary-wrap">
                <Link className="lib-quiet lib-empty-secondary" href="/preview">看看主题样张</Link>
              </p>
            </section>
          ) : null}

          {phase === "ready" && tab === "time" && photos.length > 0 ? (
            <>
              {hasMore ? <p className="lib-more">先显示最近上传的一部分。</p> : null}
              {draftAlbumId ? (
                <p className="lib-draft">有一本相册还没放完照片，重试只会继续放入刚才那一批。</p>
              ) : null}
              <LibraryGrid
                photos={photos}
                timeZone={timeZone}
                selected={selected}
                selecting={selecting}
                focusId={focusId}
                locked={pending || lightboxId !== null}
                onFocus={setFocusId}
                onToggle={selectPhoto}
                onSelectDay={selectDay}
                onClear={clearSelection}
                onOpenLightbox={openLightbox}
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

      {!desktopSelectionBar ? selectionBar : null}

      <LibraryUploadWorkbench
        open={uploadWorkbenchOpen}
        collapsed={uploadCollapsed}
        theme={shellSkin}
        assets={uploadAssets}
        albumEmpty={photos.length === 0}
        onExpand={() => setUploadCollapsed(false)}
        onCollapse={() => setUploadCollapsed(true)}
        onDismiss={dismissUploadWorkbench}
        onQueueSnapshot={(snapshot) => {
          uploadQueueRef.current = snapshot;
        }}
        onUploaded={() => void load("silent")}
      />

      <LibraryLightbox
        open={lightboxId !== null}
        assetId={lightboxId}
        orderedIds={lightboxOrderedIds}
        photosById={photosById}
        timeZone={timeZone}
        onClose={closeLightbox}
        onChange={setLightboxId}
        onPreviewError={(src) => {
          if (brokenPreviews.current.has(src)) return;
          brokenPreviews.current.add(src);
          void load("silent");
        }}
      />

      <LibraryCreateDialog
        open={composerOpen}
        step={composeStep}
        pending={pending}
        locked={Boolean(draftAlbumId)}
        title={title}
        themeId={themeId}
        coverPhoto={coverPhoto}
        count={(draftIds ?? selected).length}
        error={createError}
        albumHref={draftAlbumId ? `/albums/${encodeURIComponent(draftAlbumId)}` : null}
        onClose={() => {
          setComposerOpen(false);
          window.requestAnimationFrame(() => composeTriggerRef.current?.focus());
        }}
        onStep={setComposeStep}
        onTitle={(value) => {
          setTitleDirty(true);
          setTitle(value);
        }}
        onTheme={(id) => {
          setThemeId(id);
          if (!titleDirty) setTitle(defaultComposeTitle(id));
        }}
        onSubmit={() => void submitAlbum()}
      />

      <p className="lib-sr" aria-live="polite">{toast}</p>
    </div>
  );
}

function onTabKey(event: React.KeyboardEvent) {
  const tabs = TABS;
  const current = document.activeElement?.id?.replace("tab-", "") as Tab | undefined;
  const index = tabs.findIndex((item) => item.id === current);
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
  else return;
  event.preventDefault();
  const id = tabs[next]?.id;
  if (!id) return;
  document.getElementById(`tab-${id}`)?.focus();
}
