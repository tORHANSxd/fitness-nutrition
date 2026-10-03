import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { preferenceCookieNames, preferencesFromCookies, type PreferenceCookieName } from "@/lib/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "NutriTrain · 训练与营养计划器",
  description: "NutriTrain 训练、体测与营养计划工作台"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eff1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0d100c" }
  ]
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const cookieValues = Object.fromEntries(
    Object.values(preferenceCookieNames).map((name) => [name, cookieStore.get(name)?.value])
  ) as Partial<Record<PreferenceCookieName, string>>;
  const preferences = preferencesFromCookies(cookieValues);

  return (
    <html
      lang={preferences.locale}
      data-theme={preferences.theme}
      data-reduce-motion={preferences.reduceMotion == null ? "system" : String(preferences.reduceMotion)}
    >
      <body>{children}</body>
    </html>
  );
}
