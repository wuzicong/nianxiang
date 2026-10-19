"use client";

import { assetStatusLabel, previewUrl, type AlbumAssetView } from "../../lib/album-assets";
import "./album-asset-grid.css";

export function AlbumAssetGrid({
  assets,
  onPreviewError,
  uploadAnchorId,
}: {
  assets: AlbumAssetView[];
  onPreviewError: (src: string) => void;
  uploadAnchorId?: string;
}) {
  if (assets.length === 0) {
    return (
      <div className="album-assets album-assets-empty">
        <h3>这本相册还是空的</h3>
        <p>
          在下方上传区域拖入或选择照片，预览生成后会出现在这里。
          {uploadAnchorId ? (
            <>
              {" "}
              <a href={`#${uploadAnchorId}`}>前往上传</a>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <ul className="album-assets album-assets-grid">
      {assets.map((asset) => {
        const src = previewUrl(asset.previews);
        const label = assetStatusLabel(asset.status);
        const failed = asset.status === "failed";
        return (
          <li
            key={asset.assetId}
            className="album-assets-tile"
            data-asset-id={asset.assetId}
            data-asset-status={asset.status}
            data-failed={failed ? "true" : undefined}
          >
            {src ? (
              <img
                className="album-assets-thumb"
                src={src}
                alt="照片"
                referrerPolicy="no-referrer"
                onError={() => onPreviewError(src)}
              />
            ) : (
              <div className="album-assets-placeholder">
                {asset.status === "ready" ? "暂无预览" : label}
              </div>
            )}
            <p className="album-assets-caption">照片</p>
            <p className="album-assets-meta">
              {label}
              {failed && asset.error ? ` · ${asset.error}` : ""}
              {asset.filename ? (
                <span className="album-assets-filename" title={asset.filename}>{asset.filename}</span>
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
