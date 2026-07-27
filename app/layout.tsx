import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NutriTrain · 训练与营养计划器",
  description: "NutriTrain 训练、体测与营养计划工作台"
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
  themeColor: "#11130F"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
