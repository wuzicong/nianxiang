import type { Metadata } from "next";
import { AlbumFontScope } from "../../../album-fonts";
import "../../../preview/album-preview.css";
import "../../../s/share-theme.css";

export const metadata: Metadata = {
  title: "成册预览 · 念册",
  description: "用这本相册的预览图，按主题排成故事或翻页。",
  robots: { index: false, follow: false },
};

export default function OwnedAlbumPreviewLayout({ children }: { children: React.ReactNode }) {
  return <AlbumFontScope>{children}</AlbumFontScope>;
}
