import type { Metadata } from "next";
import { Caveat, Cormorant_Garamond, Fraunces, Inter } from "next/font/google";
import "./album-preview.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
  variable: "--font-fraunces",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-cormorant",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-inter",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: "样张预览 · 念册",
  description: "三套 Memora 模板的成册样张，不读取真实上传。",
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} ${cormorant.variable} ${inter.variable} ${caveat.variable}`}>
      {children}
    </div>
  );
}
