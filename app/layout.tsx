import type { Metadata, Viewport } from "next";
import { Source_Serif_4 } from "next/font/google";
import "lxgw-wenkai-webfont/lxgwwenkai-regular.css";
import "lxgw-wenkai-webfont/lxgwwenkai-bold.css";
import "./globals.css";

// 字体策略：英文一律 Anthropic Serif（专有字体，仅声明——本机安装即生效），
// 回退 Source Serif 4（气质最接近的开源衬线）；中文一律霞鹜文楷 LXGW WenKai（OFL，自托管切片按需加载）。
// 西文字体排在中文字体之前：拉丁字形由前者命中，中文字符自然落到文楷。
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "NutriTrain · 训练与营养计划器",
  description: "NutriTrain —— 按 v2 训练营养计划（固定每日目标 + 五分化训练）管理饮食与训练"
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
    <html lang="zh-CN" suppressHydrationWarning className={sourceSerif.variable}>
      <body>{children}</body>
    </html>
  );
}
