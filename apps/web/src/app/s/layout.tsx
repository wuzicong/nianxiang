import type { Metadata } from "next";
import "./share-theme.css";

export const metadata: Metadata = {
  title: "分享 · 念册",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
