import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-manrope", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "健身营养计划",
  description: "基于 BMR、TDEE 和碳循环的在线健身饮食计划器"
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
  themeColor: "#0a0814"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${manrope.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
