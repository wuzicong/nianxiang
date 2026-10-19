"use client";

import { assetStatusLabel, previewUrl, type AlbumAssetView } from "../../lib/album-assets";

export function AlbumAssetGrid({
  assets,
  onPreviewError,
}: {
  assets: AlbumAssetView[];
  onPreviewError: (src: string) => void;
}) {
  if (assets.length === 0) {
    return <p style={{ color: "#555" }}>还没有照片。</p>;
  }

  return (
    <ul
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "0.75rem",
        padding: 0,
        margin: "1rem 0 0",
        listStyle: "none",
      }}
    >
      {assets.map((asset) => {
        const src = previewUrl(asset.previews);
        const label = assetStatusLabel(asset.status);
        return (
          <li
            key={asset.assetId}
            data-asset-id={asset.assetId}
            data-asset-status={asset.status}
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            {src ? (
              <img
                src={src}
                alt={asset.filename || "照片"}
                referrerPolicy="no-referrer"
                onError={() => onPreviewError(src)}
                style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
              />
            ) : (
              <div
                style={{
                  height: 140,
                  display: "grid",
                  placeItems: "center",
                  padding: "0.5rem",
                  textAlign: "center",
                  background: "#f3f1ec",
                  color: "#666",
                }}
              >
                {asset.status === "ready" ? "暂无预览" : label}
              </div>
            )}
            <p style={{ margin: 0, padding: "0.55rem 0.7rem 0", fontSize: 14 }}>
              {asset.filename || "照片"}
            </p>
            <p style={{ margin: 0, padding: "0.2rem 0.7rem 0.7rem", fontSize: 13, color: "#666" }}>
              {label}
              {asset.status === "failed" && asset.error ? ` · ${asset.error}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
