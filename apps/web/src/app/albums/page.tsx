import { DEFAULT_THEME_ID } from "@memora/shared";
import { loadDecorationSvgs } from "../../lib/theme-decorations";
import { AlbumsHome } from "./albums-home";

export default function AlbumsPage() {
  const decorations = loadDecorationSvgs(DEFAULT_THEME_ID, ["soft-blob", "envelope"]);
  return <AlbumsHome decorations={decorations} />;
}
