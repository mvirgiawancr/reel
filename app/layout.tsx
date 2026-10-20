import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Brief: creative briefs grounded in what your audience loves",
  description:
    "Describe an audience in plain words. Brief asks the Qloo taste graph what else they love and writes a creative brief from it, with every claim traced to its source.",
};

export const viewport: Viewport = { themeColor: "#f4f3f1" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
