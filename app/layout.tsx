import type { Metadata, Viewport } from "next";
import { Bebas_Neue, EB_Garamond, Geist } from "next/font/google";
import "./reel.css";

const display = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-display" });
const text = EB_Garamond({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-text" });
const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Reel: your taste, played back",
  description:
    "Name up to five things you love. Reel asks the Qloo taste graph what else you would love, across music, film, TV, books, podcasts and brands, and plays it back as a reel of cards.",
};

export const viewport: Viewport = { themeColor: "#3d0012" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${geist.variable}`}>
      <body>{children}</body>
    </html>
  );
}
