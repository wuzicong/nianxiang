import { THEME_IDS } from "@memora/shared";
import { albumTheme } from "../../../../lib/album-theme";
import { loadDecorationSvgs } from "../../../../lib/theme-decorations";
import { OwnedAlbumStage } from "./owned-album-stage";

export const dynamic = "force-dynamic";

export default async function OwnedAlbumPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ albumId: string }>;
  searchParams: Promise<{ layout?: string | string[] }>;
}) {
  const { albumId } = await params;
  const query = await searchParams;
  const requested = Array.isArray(query.layout) ? query.layout[0] : query.layout;
  const decorationsByTheme: Record<string, Record<string, string>> = {};
  for (const themeId of THEME_IDS) {
    const theme = albumTheme(themeId);
    decorationsByTheme[themeId] = theme ? loadDecorationSvgs(themeId, theme.decorations) : {};
  }
  return (
    <OwnedAlbumStage
      albumId={albumId}
      requestedLayout={requested ?? null}
      decorationsByTheme={decorationsByTheme}
    />
  );
}
