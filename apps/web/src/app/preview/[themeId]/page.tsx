import { isThemeId, THEME_IDS } from "@memora/shared";
import { notFound } from "next/navigation";
import { albumTheme, resolveAlbumLayout } from "../../../lib/album-theme";
import { buildDemoAlbum } from "../../../lib/album-demo";
import { loadDecorationSvgs } from "../../../lib/theme-decorations";
import { AlbumStage } from "../album-stage";

export function generateStaticParams() {
  return THEME_IDS.map((themeId) => ({ themeId }));
}

export async function generateMetadata({ params }: { params: Promise<{ themeId: string }> }) {
  const { themeId } = await params;
  const theme = albumTheme(themeId);
  return { title: theme ? `${theme.skin.name} · 样张 · 念册` : "样张 · 念册" };
}

export default async function PreviewThemePage({
  params,
  searchParams,
}: {
  params: Promise<{ themeId: string }>;
  searchParams: Promise<{ layout?: string | string[] }>;
}) {
  const { themeId } = await params;
  if (!isThemeId(themeId)) notFound();
  const theme = albumTheme(themeId);
  if (!theme) notFound();
  const query = await searchParams;
  const requested = Array.isArray(query.layout) ? query.layout[0] : query.layout;
  const decorations = loadDecorationSvgs(themeId, theme.decorations);
  return (
    <AlbumStage
      theme={theme}
      album={buildDemoAlbum(theme)}
      decorations={decorations}
      initialLayout={resolveAlbumLayout(theme, requested)}
      source={{ kind: "demo" }}
    />
  );
}
