import type { Metadata } from "next";
import { AlbumFontScope } from "../album-fonts";
import "./album-preview.css";

export const metadata: Metadata = {
  title: "样张预览 · 念册",
  description: "三套 Memora 模板的成册样张，不读取真实上传。",
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <AlbumFontScope>{children}</AlbumFontScope>;
}
