import type { Metadata } from "next";
import { Inter, Manrope, Instrument_Serif, Cabin } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-manrope", display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-instrument", display: "swap" });
const cabin = Cabin({ subsets: ["latin"], weight: ["500"], variable: "--font-cabin", display: "swap" });

export const metadata: Metadata = {
  title: "健身营养计划",
  description: "基于 BMR、TDEE 和碳循环的在线健身饮食计划器"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${inter.variable} ${manrope.variable} ${instrument.variable} ${cabin.variable}`}>
      <body>{children}</body>
    </html>
  );
}
