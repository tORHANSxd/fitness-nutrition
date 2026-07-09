import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Claude 官网风字体：正文无衬线（Styrene 气质 → Inter），大标题衬线（Copernicus 气质 → Source Serif 4）。
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "NutriTrain · 碳循环计划器",
  description: "NutriTrain —— 基于 BMR、TDEE 和碳循环的在线健身饮食计划器"
};

// 手机端视口：锁定为设备宽度、禁止整屏缩放（消除 iOS 聚焦输入框时的自动放大与手势缩放导致
// 的“部分栏随缩放、部分不随”错位）；viewportFit=cover 让页面内已使用的 env(safe-area-inset-*)
// 在灵动岛/刘海机型（如 iPhone 16 Pro Max）真正返回非零值，底部导航才能正确避让 Home 指示条。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#FAF9F5"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${inter.variable} ${sourceSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
