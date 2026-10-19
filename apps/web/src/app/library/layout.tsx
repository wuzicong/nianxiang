import type { Metadata } from "next";
import { AlbumFontScope } from "../album-fonts";
import "./library.css";

export const metadata: Metadata = {
  title: "照片库 · 念册",
  description: "按拍摄时间查看自己的照片，选片后套用主题成册。",
  robots: { index: false, follow: false },
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <AlbumFontScope>{children}</AlbumFontScope>;
}
