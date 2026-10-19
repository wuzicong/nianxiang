import type { Metadata } from "next";
import { AlbumFontScope } from "../album-fonts";
import "../library/library.css";
import "../shell/shell.css";

export const metadata: Metadata = {
  title: "登录 · 念册",
  description: "登录或注册念册账户。",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AlbumFontScope>{children}</AlbumFontScope>;
}
