"use client";

import { THEME_IDS, type ThemeId } from "@memora/shared";
import { useEffect, useId, useRef } from "react";
import { albumFontFaces, albumTheme } from "../../lib/album-theme";

/**
 * 三套主题都来自 templates 的 theme.json。
 * 相册一旦创建失败在「放入照片」这一步，标题和主题就锁住：没有改相册的接口。
 */
export function LibraryCreateDialog({
  open,
  pending,
  locked,
  title,
  themeId,
  count,
  error,
  albumHref,
  onTitle,
  onTheme,
  onClose,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  locked: boolean;
  title: string;
  themeId: string;
  count: number;
  error: string | null;
  albumHref: string | null;
  onTitle: (value: string) => void;
  onTheme: (id: ThemeId) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const themesId = useId();

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="lib-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClose={() => {
        if (!pending) onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current && !pending) onClose();
      }}
    >
      <form
        className="lib-dialog-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) onSubmit();
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="lib-kicker-small">三套主题</p>
        <h2 id={titleId}>生成相册</h2>
        <p>把 {count} 张按时间放进册子，然后打开预览。用的是已经做好的模板。</p>
        <label className="lib-field">
          相册标题
          <input
            value={title}
            maxLength={80}
            required
            readOnly={locked}
            onChange={(event) => onTitle(event.target.value)}
          />
        </label>
        <fieldset className="lib-themes" aria-labelledby={themesId} disabled={locked || pending}>
          <legend id={themesId} className="lib-sr">
            选择主题
          </legend>
          {THEME_IDS.map((id) => {
            const theme = albumTheme(id);
            if (!theme) return null;
            const faces = albumFontFaces(theme);
            const skin = theme.skin;
            return (
              <label
                key={id}
                className="lib-theme"
                data-theme={id}
                data-checked={themeId === id ? "true" : "false"}
                style={{
                  background: skin.colors.background,
                  color: skin.colors.text,
                  borderColor: id === "magazine-heirloom" ? skin.colors.text : skin.colors.border,
                  borderRadius: skin.radius.card,
                  boxShadow: skin.shadow,
                  fontFamily: faces.body,
                }}
              >
                <input
                  type="radio"
                  name="library-theme"
                  value={id}
                  checked={themeId === id}
                  onChange={() => onTheme(id)}
                />
                <span className="lib-theme-bar" style={{ background: skin.colors.brand }} />
                <span className="lib-theme-en" style={{ fontFamily: faces.title }}>
                  {theme.englishName}
                </span>
                <strong style={{ fontFamily: faces.title }}>{skin.name}</strong>
                <small>{theme.shareSubtitle}</small>
              </label>
            );
          })}
        </fieldset>
        {error ? (
          <p className="lib-alert" role="alert">
            {error}
            {albumHref ? (
              <>
                {" "}
                <a className="lib-link" href={albumHref}>
                  打开这本还没放完的相册
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="lib-dialog-actions">
          <button type="button" className="lib-quiet" disabled={pending} onClick={onClose}>
            取消
          </button>
          <button type="submit" className="lib-primary" disabled={pending || title.trim().length < 1 || count < 1}>
            {pending ? "正在生成…" : "生成并预览"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
