"use client";

import { useRef, useState } from "react";
import type { AlbumAssetView } from "../../lib/album-assets";
import type { ThemeSkin } from "../../lib/themes";
import { UploadPhotos, type UploadQueueSnapshot } from "../albums/upload-photos";

function collapsedWorkbenchLabel(snapshot: UploadQueueSnapshot): string {
  if (snapshot.total === 0) return "上传照片";
  if (snapshot.uploading > 0 || snapshot.waiting > 0) {
    const active = snapshot.uploading + snapshot.waiting;
    return `上传中 · ${active} 张`;
  }
  if (snapshot.processing > 0) {
    return `生成预览 · ${snapshot.processing} 张`;
  }
  if (snapshot.failed > 0) {
    return snapshot.failed === 1 ? "1 张需重试或移除" : `${snapshot.failed} 张需重试或移除`;
  }
  if (snapshot.done > 0) {
    return snapshot.done === 1 ? "1 张已加入图库" : `${snapshot.done} 张已加入图库`;
  }
  return "上传队列";
}

export function LibraryUploadWorkbench({
  open,
  collapsed,
  theme,
  assets,
  albumEmpty,
  onExpand,
  onCollapse,
  onDismiss,
  onQueueSnapshot,
  onUploaded,
}: {
  open: boolean;
  collapsed: boolean;
  theme: ThemeSkin;
  assets: AlbumAssetView[];
  albumEmpty: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onDismiss: () => void;
  onQueueSnapshot: (snapshot: UploadQueueSnapshot) => void;
  onUploaded: () => void;
}) {
  const snapshotRef = useRef<UploadQueueSnapshot>({
    waiting: 0,
    uploading: 0,
    processing: 0,
    done: 0,
    failed: 0,
    total: 0,
    hasActive: false,
  });
  const [collapsedLabel, setCollapsedLabel] = useState("上传照片");

  function handleSnapshot(next: UploadQueueSnapshot) {
    snapshotRef.current = next;
    setCollapsedLabel(collapsedWorkbenchLabel(next));
    onQueueSnapshot(next);
  }

  function handleClose() {
    const snap = snapshotRef.current;
    if (snap.hasActive || snap.failed > 0 || snap.processing > 0) {
      onCollapse();
      return;
    }
    onDismiss();
  }

  if (!open) return null;

  return (
    <div
      className="lib-upload-workbench"
      role="region"
      aria-label="上传工作台"
      data-open="true"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="lib-upload-workbench-chrome">
        {collapsed ? (
          <button
            type="button"
            className="lib-upload-workbench-expand"
            onClick={onExpand}
            aria-expanded="false"
          >
            <span className="lib-upload-workbench-expand-label">{collapsedLabel}</span>
            <span className="lib-upload-workbench-expand-hint" aria-hidden="true">展开</span>
          </button>
        ) : (
          <>
            <p className="lib-upload-workbench-title">上传</p>
            <div className="lib-upload-workbench-tools">
              <button type="button" className="lib-text-button" onClick={onCollapse} aria-expanded="true">
                收起
              </button>
              <button type="button" className="lib-text-button" onClick={handleClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </div>
      <div className="lib-upload-workbench-body" hidden={collapsed} aria-hidden={collapsed}>
        <UploadPhotos
          target={{ kind: "library" }}
          theme={theme}
          assets={assets}
          albumEmpty={albumEmpty}
          embedded
          onUploaded={onUploaded}
          onQueueSnapshot={handleSnapshot}
        />
      </div>
    </div>
  );
}
