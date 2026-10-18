import { notFound } from "next/navigation";
import { loadPublicShare } from "../../../lib/share";
import { themeSkin } from "../../../lib/themes";
import { ShareGallery } from "../share-gallery";
import { ShareStatus } from "../share-status";
import { ShareUnlock } from "../share-unlock";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadPublicShare(token);
  if (loaded.kind === "missing") notFound();
  if (loaded.kind === "locked") return <ShareUnlock token={token} />;
  if (loaded.kind === "unavailable") {
    return <ShareStatus title="暂时打不开" body="分享服务暂时不可用，请稍后再试。" />;
  }

  return <ShareGallery share={loaded.share} theme={themeSkin(loaded.share.album.themeId)} />;
}
