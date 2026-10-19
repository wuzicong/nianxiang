"use client";

import { useRef, useState } from "react";
import { uploadPhaseLabel, uploadPhotoToAlbum, type UploadPhase } from "../../lib/uploads";

type Row = { name: string; detail: string; failed: boolean };

export function UploadPhotos({
  albumId,
  onUploaded,
}: {
  albumId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState("");
  const [chosen, setChosen] = useState("未选择文件");
  const [pending, setPending] = useState(false);

  function patchRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function submit(files: File[]) {
    if (pending) return;
    if (files.length === 0) {
      setSummary("请先选择图片。");
      return;
    }
    setPending(true);
    setSummary("");
    setRows(files.map((file) => ({ name: file.name || "未命名", detail: "排队中", failed: false })));
    let stopped = false;
    let added = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) continue;
      const result = await uploadPhotoToAlbum({
        albumId,
        filename: file.name,
        mime: file.type,
        body: file,
        onPhase(phase: UploadPhase) {
          patchRow(index, { detail: uploadPhaseLabel(phase) });
        },
      });
      if (!result.ok) {
        stopped = true;
        patchRow(index, { detail: result.message, failed: true });
        setSummary(`「${file.name || "未命名"}」没有加入相册，后面的文件已停止。`);
        break;
      }
      added += 1;
      patchRow(index, { detail: "已加入相册" });
      onUploaded();
    }
    if (!stopped) {
      setSummary(added === 1 ? "照片已加入相册。" : `${added} 张照片已加入相册。`);
    }
    if (inputRef.current) inputRef.current.value = "";
    setChosen("未选择文件");
    setPending(false);
  }

  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>上传照片</h2>
      <p style={{ lineHeight: 1.6, color: "#555" }}>
        选择 jpeg、png、webp 或 gif。照片会先进入你的私有空间，确认后再加入这本相册，并排队生成预览。
      </p>
      <form
        style={{ display: "grid", gap: "0.75rem", maxWidth: 420, marginTop: "1rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          const files = inputRef.current?.files ? Array.from(inputRef.current.files) : [];
          void submit(files);
        }}
      >
        <div style={{ position: "relative" }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
            multiple
            disabled={pending}
            onChange={(event) => {
              const files = event.target.files;
              if (!files || files.length === 0) {
                setChosen("未选择文件");
                return;
              }
              setChosen(files.length === 1 ? files[0]?.name || "未命名" : `已选择 ${files.length} 张`);
            }}
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              border: 0,
            }}
          />
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button type="button" disabled={pending} onClick={() => inputRef.current?.click()}>
              选择图片
            </button>
            <span style={{ fontSize: 14, color: "#555" }}>{chosen}</span>
          </div>
        </div>
        <button type="submit" disabled={pending}>
          {pending ? "正在上传…" : "上传并加入相册"}
        </button>
      </form>
      {summary ? (
        <p aria-live="polite" style={{ lineHeight: 1.6, color: "#555", marginTop: "0.75rem" }}>
          {summary}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, marginTop: "0.75rem" }}>
          {rows.map((row, index) => (
            <li key={`${row.name}-${index}`} data-upload-row={row.failed ? "failed" : "ok"} style={{ fontSize: 14 }}>
              {row.name} · {row.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
