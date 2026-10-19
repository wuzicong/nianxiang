import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEFAULT_THEME_ID } from "@memora/shared";
import { SHARE_RATE_LIMIT_BODY, SHARE_RATE_LIMIT_TITLE } from "../../../lib/share";
import { loadSharePage } from "../../../lib/share-request";
import { resolveLockedThemeId, themeIdFromHint, themeSkin } from "../../../lib/themes";
import { ShareGallery } from "../share-gallery";
import { ShareStatus } from "../share-status";
import { ShareUnlock } from "../share-unlock";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ t?: string | string[]; smokeRateLimit?: string | string[] }>;
}): Promise<Metadata> {
  const { token } = await params;
  const query = await searchParams;
  const loaded = await loadSharePage(token, query.smokeRateLimit);
  if (loaded.kind === "locked") {
    return {
      title: "念册 · 需要密码",
      robots: { index: false, follow: false },
    };
  }
  if (loaded.kind === "limited") {
    return {
      title: `念册 · ${SHARE_RATE_LIMIT_TITLE}`,
      robots: { index: false, follow: false },
    };
  }
  return {};
}

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ t?: string | string[]; smokeRateLimit?: string | string[] }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const loaded = await loadSharePage(token, query.smokeRateLimit);
  if (loaded.kind === "limited") {
    return (
      <ShareStatus
        title={SHARE_RATE_LIMIT_TITLE}
        body={SHARE_RATE_LIMIT_BODY}
        theme={themeSkin(themeIdFromHint(query.t) ?? DEFAULT_THEME_ID)}
        state="limited"
      />
    );
  }
  if (loaded.kind === "missing") notFound();
  if (loaded.kind === "locked") {
    return <ShareUnlock token={token} theme={themeSkin(resolveLockedThemeId(loaded.themeId, query.t))} />;
  }
  if (loaded.kind === "unavailable") {
    return (
      <ShareStatus
        title="暂时打不开"
        body="分享服务暂时不可用，请稍后再试。"
        theme={themeSkin(themeIdFromHint(query.t) ?? DEFAULT_THEME_ID)}
      />
    );
  }

  return <ShareGallery share={loaded.share} theme={themeSkin(loaded.share.album.themeId)} />;
}
