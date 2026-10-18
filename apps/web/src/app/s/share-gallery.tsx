import type { ThemeSkin } from "../../lib/themes";
import type { PublicShareAsset, PublicSharePayload } from "../../lib/share";

function imageUrl(asset: PublicShareAsset): string | null {
  return (
    asset.derivatives.preview?.url ??
    asset.derivatives.hero?.url ??
    asset.derivatives.thumb?.url ??
    null
  );
}

export function ShareGallery({
  share,
  theme,
  refreshHint,
}: {
  share: PublicSharePayload;
  theme: ThemeSkin;
  refreshHint?: string;
}) {
  return (
    <main
      data-share-state="open"
      data-theme={theme.id}
      style={{
        minHeight: "100vh",
        background: theme.colors.background,
        color: theme.colors.text,
        padding: "3rem 1.25rem 4rem",
      }}
    >
      <article style={{ maxWidth: 960, margin: "0 auto" }}>
        <p style={{ margin: 0 }}>
          <a href="/" style={{ color: theme.colors.accent }}>
            念册
          </a>
        </p>
        <p style={{ margin: "1.5rem 0 0", letterSpacing: "0.08em", color: theme.colors.accent }}>
          {theme.name}
        </p>
        <h1 style={{ margin: "0.35rem 0 0", fontWeight: 600, letterSpacing: "-0.03em", fontSize: "2.25rem" }}>
          {share.album.title}
        </h1>
        <p style={{ lineHeight: 1.6, maxWidth: 460 }}>
          只读分享。图片地址大约 15 分钟内有效。
          {refreshHint ?? "刷新页面即可继续查看。"}
        </p>
        {share.assets.length === 0 ? (
          <p>这本相册还没有照片。</p>
        ) : (
          <ul
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "1rem",
              padding: 0,
              margin: "2rem 0 0",
              listStyle: "none",
            }}
          >
            {share.assets.map((asset) => {
              const src = imageUrl(asset);
              return (
                <li
                  key={asset.assetId}
                  style={{
                    background: theme.colors.primary,
                    color: theme.colors.text,
                    borderRadius: theme.radius.card,
                    overflow: "hidden",
                  }}
                >
                  {src ? (
                    <img
                      src={src}
                      alt={asset.filename || "照片"}
                      referrerPolicy="no-referrer"
                      style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <div style={{ height: 220, display: "grid", placeItems: "center" }}>暂无预览</div>
                  )}
                  <p style={{ margin: 0, padding: "0.75rem 0.9rem" }}>{asset.filename || "照片"}</p>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </main>
  );
}
