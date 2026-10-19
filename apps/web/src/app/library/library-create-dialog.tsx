"use client";

import { DEFAULT_THEME_ID, THEME_IDS, type ThemeId } from "@memora/shared";
import { useEffect, useId, useRef } from "react";
import { albumFontFaces, albumTheme } from "../../lib/album-theme";
import { previewUrl } from "../../lib/album-assets";
import type { LibraryPhoto } from "../../lib/library";
import { shareThemeStyle } from "../s/share-chrome";

type Step = "theme" | "title";

export function LibraryCreateDialog({
  open,
  step,
  pending,
  locked,
  title,
  themeId,
  coverPhoto,
  count,
  error,
  albumHref,
  onClose,
  onStep,
  onTitle,
  onTheme,
  onSubmit,
}: {
  open: boolean;
  step: Step;
  pending: boolean;
  locked: boolean;
  title: string;
  themeId: ThemeId;
  coverPhoto: LibraryPhoto | null;
  count: number;
  error: string | null;
  albumHref: string | null;
  onClose: () => void;
  onStep: (step: Step) => void;
  onTitle: (value: string) => void;
  onTheme: (id: ThemeId) => void;
  onSubmit: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const themesId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (step === "title") {
      const input = titleInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
      return;
    }
    const dialog = dialogRef.current;
    const firstTheme = dialog?.querySelector<HTMLInputElement>(
      'input[name="library-theme"]',
    );
    firstTheme?.focus();
  }, [open, step]);

  const coverSrc = coverPhoto ? previewUrl(coverPhoto.previews) : null;

  return (
    <dialog
      ref={dialogRef}
      className="lib-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClose={onClose}
    >
      <form
        className="lib-dialog-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === "theme") {
            onStep("title");
            return;
          }
          onSubmit();
        }}
      >
        <p className="lib-kicker-small">{step === "theme" ? "第 1 步" : "第 2 步"}</p>
        <h2 id={titleId}>{step === "theme" ? "做成主题相册" : "起个标题"}</h2>
        <p>
          {step === "theme"
            ? `为已选的 ${count} 张挑一套皮肤。封面会用你自己的预览图。`
            : "相册默认只有你能看到。生成分享链接是之后单独的一步。"}
        </p>

        {step === "theme" ? (
          <fieldset
            className="lib-themes"
            role="radiogroup"
            aria-labelledby={themesId}
            disabled={locked || pending}
          >
            <legend id={themesId} className="lib-sr">选择主题</legend>
            {THEME_IDS.map((id) => {
              const theme = albumTheme(id);
              if (!theme) return null;
              const faces = albumFontFaces(theme);
              const skin = theme.skin;
              const layouts = theme.layouts.join(" / ");
              return (
                <label
                  key={id}
                  className="lib-theme share-shell"
                  data-theme={id}
                  data-checked={themeId === id ? "true" : "false"}
                  style={shareThemeStyle(skin)}
                >
                  <input
                    type="radio"
                    name="library-theme"
                    value={id}
                    checked={themeId === id}
                    onChange={() => onTheme(id)}
                  />
                  <span className="lib-theme-cover" style={{ borderRadius: skin.radius.card }}>
                    {coverSrc ? (
                      <img src={coverSrc} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="lib-theme-cover-empty" />
                    )}
                  </span>
                  <span className="lib-theme-bar" style={{ background: skin.colors.brand }} />
                  <span className="lib-theme-en" style={{ fontFamily: faces.title }}>{theme.englishName}</span>
                  <strong style={{ fontFamily: faces.title }}>{skin.name}</strong>
                  <small>{theme.shareSubtitle}</small>
                  <span className="lib-theme-layouts">{layouts}</span>
                </label>
              );
            })}
          </fieldset>
        ) : (
          <label className="lib-field">
            相册标题
            <input
              ref={titleInputRef}
              type="text"
              maxLength={80}
              value={title}
              disabled={locked || pending}
              onChange={(event) => onTitle(event.target.value)}
            />
          </label>
        )}

        {error ? (
          <p className="lib-alert" role="alert">
            {error}
            {albumHref ? (
              <>
                {" "}
                <a className="lib-link" href={albumHref}>打开这本相册</a>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="lib-dialog-actions">
          <button type="button" className="lib-quiet" disabled={pending} onClick={onClose}>
            取消
          </button>
          {step === "title" ? (
            <button type="button" className="lib-quiet" disabled={pending} onClick={() => onStep("theme")}>
              上一步
            </button>
          ) : null}
          <button
            type="submit"
            className="lib-primary"
            disabled={
              pending ||
              count < 1 ||
              (step === "title" && title.trim().length < 1)
            }
          >
            {pending ? "正在生成…" : step === "theme" ? "下一步" : "生成预览"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function defaultComposeTitle(themeId: ThemeId = DEFAULT_THEME_ID): string {
  const theme = albumTheme(themeId);
  return theme?.shareTitle?.trim() || "我们的相册";
}
