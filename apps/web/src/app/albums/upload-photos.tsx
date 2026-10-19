"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AlbumAssetView } from "../../lib/album-assets";
import { runUploadPool } from "../../lib/run-upload-pool";
import {
  friendlyUploadError,
  UPLOAD_CONCURRENCY,
  uploadAcceptAttribute,
  uploadHints,
  validateUploadFile,
} from "../../lib/upload-policy";
import type { ThemeSkin } from "../../lib/themes";
import { shareThemeStyle } from "../s/share-chrome";
import { uploadPhaseLabel, uploadPhotoToAlbum, type UploadPhase } from "../../lib/uploads";
import "./album-upload.css";

type QueueStatus = "waiting" | "uploading" | "processing" | "done" | "failed";

type QueueEntry = {
  id: string;
  file: File;
  status: QueueStatus;
  detail: string;
  progress: number;
  assetId?: string;
};

function phaseProgress(phase: UploadPhase, putRatio: number): number {
  switch (phase) {
    case "request":
      return 8;
    case "put":
      return 10 + Math.round(putRatio * 72);
    case "complete":
      return 88;
    case "attach":
      return 96;
  }
}

function statusLabel(status: QueueStatus): string {
  switch (status) {
    case "waiting":
      return "等待中";
    case "uploading":
      return "上传中";
    case "processing":
      return "正在生成预览";
    case "done":
      return "已完成";
    case "failed":
      return "失败";
  }
}

function newEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function UploadPhotos({
  albumId,
  theme,
  assets,
  albumEmpty,
  onUploaded,
}: {
  albumId: string;
  theme: ThemeSkin;
  assets: AlbumAssetView[];
  albumEmpty: boolean;
  onUploaded: () => void;
}) {
  const formId = useId();
  const inputId = `${formId}-file`;
  const liveId = `${formId}-live`;
  const inputRef = useRef<HTMLInputElement>(null);
  const removedIds = useRef(new Set<string>());
  const queueRef = useRef<QueueEntry[]>([]);
  const drainLock = useRef(false);

  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryKind, setSummaryKind] = useState<"hint" | "success" | "error">("hint");
  const [running, setRunning] = useState(false);

  const replaceQueue = useCallback((updater: (current: QueueEntry[]) => QueueEntry[]) => {
    setQueue((current) => {
      const next = updater(current);
      queueRef.current = next;
      return next;
    });
  }, []);

  const patchEntry = useCallback(
    (id: string, patch: Partial<QueueEntry>) => {
      replaceQueue((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    },
    [replaceQueue],
  );

  const inFlight = queue.some((entry) => entry.status === "waiting" || entry.status === "uploading");

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    if (!inFlight) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [inFlight]);

  useEffect(() => {
    replaceQueue((current) => {
      let changed = false;
      const next = current.map((entry) => {
        if (!entry.assetId || entry.status !== "processing") return entry;
        const asset = assets.find((row) => row.assetId === entry.assetId);
        if (!asset) return entry;
        if (asset.status === "ready") {
          changed = true;
          return { ...entry, status: "done" as const, detail: "预览已就绪", progress: 100 };
        }
        if (asset.status === "failed") {
          changed = true;
          return {
            ...entry,
            status: "failed" as const,
            detail: "预览生成失败，可移除后重新上传。",
            progress: 0,
          };
        }
        return entry;
      });
      return changed ? next : current;
    });
  }, [assets, replaceQueue]);

  function setSummaryMessage(text: string, kind: "hint" | "success" | "error") {
    setSummary(text);
    setSummaryKind(kind);
  }

  function refreshSummary() {
    const current = queueRef.current.filter((entry) => !removedIds.current.has(entry.id));
    const done = current.filter((e) => e.status === "done").length;
    const failed = current.filter((e) => e.status === "failed").length;
    const processing = current.filter((e) => e.status === "processing").length;
    const active = current.filter((e) => e.status === "uploading" || e.status === "waiting").length;
    if (active > 0) return;
    if (failed > 0 && done === 0) {
      setSummaryMessage("有照片未能加入相册，可重试或移除后继续。", "error");
    } else if (failed > 0) {
      setSummaryMessage(`已完成 ${done} 张，${failed} 张失败，${processing} 张仍在生成预览。`, "error");
    } else if (processing > 0) {
      setSummaryMessage(done > 0 ? `${done} 张已上传，预览生成中…` : "照片已加入相册，预览生成中…", "success");
    } else if (done > 0) {
      setSummaryMessage(done === 1 ? "照片已加入相册。" : `${done} 张照片已加入相册。`, "success");
    }
  }

  const uploadOne = useCallback(
    async (entry: QueueEntry) => {
      if (removedIds.current.has(entry.id)) return;
      patchEntry(entry.id, { status: "uploading", detail: uploadPhaseLabel("request"), progress: 4 });
      const file = entry.file;
      let putRatio = 0;
      const result = await uploadPhotoToAlbum({
        albumId,
        filename: file.name,
        mime: file.type,
        body: file,
        onPhase(phase: UploadPhase) {
          if (removedIds.current.has(entry.id)) return;
          patchEntry(entry.id, {
            status: "uploading",
            detail: uploadPhaseLabel(phase),
            progress: phaseProgress(phase, putRatio),
          });
        },
        onPutProgress(ratio) {
          putRatio = ratio;
          if (removedIds.current.has(entry.id)) return;
          patchEntry(entry.id, {
            status: "uploading",
            detail: "正在上传原图…",
            progress: phaseProgress("put", ratio),
          });
        },
      });
      if (removedIds.current.has(entry.id)) return;
      if (!result.ok) {
        patchEntry(entry.id, {
          status: "failed",
          detail: friendlyUploadError(result.message),
          progress: 0,
        });
        return;
      }
      patchEntry(entry.id, {
        status: "processing",
        detail: "已加入相册，正在生成预览…",
        progress: 100,
        assetId: result.assetId,
      });
      onUploaded();
    },
    [albumId, onUploaded, patchEntry],
  );

  const drainQueue = useCallback(async () => {
    if (drainLock.current) return;
    drainLock.current = true;
    setRunning(true);
    try {
      while (true) {
        const waiting = queueRef.current.filter(
          (entry) => entry.status === "waiting" && !removedIds.current.has(entry.id),
        );
        if (waiting.length === 0) break;
        await runUploadPool(waiting, UPLOAD_CONCURRENCY, async (entry) => {
          await uploadOne(entry);
        });
      }
    } finally {
      drainLock.current = false;
      setRunning(false);
      refreshSummary();
      const moreWaiting = queueRef.current.some(
        (entry) => entry.status === "waiting" && !removedIds.current.has(entry.id),
      );
      if (moreWaiting) void drainQueue();
    }
  }, [uploadOne]);

  function enqueueFiles(files: File[]) {
    if (files.length === 0) return;
    const accepted: QueueEntry[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const error = validateUploadFile(file);
      if (error) {
        rejected.push(error);
        continue;
      }
      accepted.push({
        id: newEntryId(),
        file,
        status: "waiting",
        detail: "排队中",
        progress: 0,
      });
    }
    if (rejected.length > 0) {
      setSummaryMessage(rejected[0]!, "error");
    } else {
      setSummaryMessage("", "hint");
    }
    if (accepted.length === 0) return;
    replaceQueue((current) => [...current, ...accepted]);
    void drainQueue();
  }

  function removeEntry(id: string) {
    removedIds.current.add(id);
    replaceQueue((current) => current.filter((entry) => entry.id !== id));
  }

  function retryEntry(id: string) {
    removedIds.current.delete(id);
    patchEntry(id, { status: "waiting", detail: "排队中", progress: 0, assetId: undefined });
    void drainQueue();
  }

  function onDropFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    enqueueFiles(Array.from(fileList));
    if (inputRef.current) inputRef.current.value = "";
  }

  const hints = uploadHints();

  return (
    <section
      className="album-upload-shell"
      data-theme={theme.id}
      style={shareThemeStyle(theme)}
      aria-labelledby={`${formId}-heading`}
    >
      <h2 id={`${formId}-heading`}>上传照片</h2>
      <p className="album-upload-lede">
        照片会先进入你的私有空间，确认后再加入这本相册。相册与分享页只展示预览，不展示原图。
      </p>

      <div
        className="album-upload-dropzone"
        data-empty={albumEmpty ? "true" : "false"}
        data-drag={dragActive ? "true" : "false"}
        role="button"
        tabIndex={0}
        aria-describedby={`${formId}-hint`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          onDropFiles(event.dataTransfer.files);
        }}
      >
        <p className="album-upload-dropzone-title">
          {albumEmpty ? "拖入第一张照片，或选择文件" : "拖入照片，或选择文件"}
        </p>
        <p className="album-upload-dropzone-hint" id={`${formId}-hint`}>
          {hints} 可多选。
        </p>
        <div className="album-upload-actions">
          <button
            type="button"
            className="album-upload-btn album-upload-btn-primary"
            disabled={running && inFlight}
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            选择图片
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={uploadAcceptAttribute()}
        multiple
        className="album-upload-file-input"
        onChange={(event) => {
          onDropFiles(event.target.files);
        }}
      />

      <p
        id={liveId}
        className="album-upload-summary"
        data-kind={summaryKind}
        aria-live="polite"
        aria-atomic="true"
      >
        {summary}
      </p>

      {queue.length > 0 ? (
        <ul className="album-upload-queue" aria-label="上传队列">
          {queue.map((entry) => (
            <li key={entry.id} className="album-upload-queue-item" data-upload-state={entry.status}>
              <div className="album-upload-queue-head">
                <div>
                  <p className="album-upload-queue-name">{entry.file.name || "未命名"}</p>
                  <p className="album-upload-queue-status" data-state={entry.status}>
                    {statusLabel(entry.status)} · {entry.detail}
                  </p>
                </div>
                <div className="album-upload-queue-tools">
                  {entry.status === "failed" ? (
                    <button type="button" onClick={() => retryEntry(entry.id)}>
                      重试
                    </button>
                  ) : null}
                  {entry.status !== "uploading" ? (
                    <button type="button" onClick={() => removeEntry(entry.id)}>
                      移除
                    </button>
                  ) : null}
                </div>
              </div>
              {entry.status === "uploading" || entry.status === "processing" ? (
                <div
                  className="album-upload-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={entry.progress}
                  aria-label={`${entry.file.name || "照片"}上传进度`}
                >
                  <span style={{ width: `${entry.progress}%` }} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
