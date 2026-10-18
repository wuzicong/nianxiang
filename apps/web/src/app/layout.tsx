import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "念册 · Memora",
  description: "智能相册与主题成册",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
