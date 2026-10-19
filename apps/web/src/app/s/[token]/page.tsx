import { notFound } from "next/navigation";
import { DEFAULT_THEME_ID } from "@memora/shared";
import { loadPublicShare } from "../../../lib/share";
import { resolveLockedThemeId, themeIdFromHint, themeSkin } from "../../../lib/themes";
import { ShareGallery } from "../share-gallery";
import { ShareStatus } from "../share-status";
import { ShareUnlock } from "../share-unlock";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const loaded = await loadPublicShare(token);
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
