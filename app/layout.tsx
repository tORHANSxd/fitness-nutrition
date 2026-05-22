import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
