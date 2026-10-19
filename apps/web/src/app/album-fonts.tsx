import { Caveat, Cormorant_Garamond, Fraunces, Inter } from "next/font/google";

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

/** 样张和真实相册成册预览共用的西文字体变量。 */
export function AlbumFontScope({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} ${cormorant.variable} ${inter.variable} ${caveat.variable}`}>
      {children}
    </div>
  );
}
