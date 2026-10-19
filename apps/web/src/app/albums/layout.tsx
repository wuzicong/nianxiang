import type { Metadata } from "next";
import { AlbumFontScope } from "../album-fonts";
import "../product-shell/product-shell.css";

export const metadata: Metadata = {
  title: "相册 · 念册",
  description: "管理主题相册、上传与分享链接。",
  robots: { index: false, follow: false },
};

export default function AlbumsLayout({ children }: { children: React.ReactNode }) {
  return <AlbumFontScope>{children}</AlbumFontScope>;
}
