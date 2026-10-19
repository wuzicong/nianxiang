import { DEFAULT_THEME_ID } from "@memora/shared";
import { loadDecorationSvgs } from "../../lib/theme-decorations";
import { LibraryHome } from "./library-home";

export default function LibraryPage() {
  const decorations = loadDecorationSvgs(DEFAULT_THEME_ID, ["soft-blob", "envelope", "sparkle"]);
  return <LibraryHome decorations={decorations} />;
}
