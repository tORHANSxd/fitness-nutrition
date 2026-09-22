"use client";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Library,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  Settings2,
  Target,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { FoodShortcutsProvider } from "@/components/FoodShortcuts";
import { useApp } from "@/components/app/AppProvider";
import { useZonedToday } from "@/hooks/useZonedToday";
import { formatDateKey } from "@/lib/dateTime";

const navigation = [
  { href: "/today", label: "今日饮食", icon: Utensils },
  { href: "/records", label: "每日记录", icon: ClipboardList },
  { href: "/progress", label: "趋势", icon: BarChart3 },
  { href: "/resources", label: "食物库", icon: Library },
  { href: "/more", label: "更多", icon: MoreHorizontal },
];
const secondary = [
  { href: "/goals", label: "饮食目标", icon: Target },
  { href: "/calendar", label: "日历", icon: CalendarDays },
  { href: "/settings", label: "偏好设置", icon: Settings2 },
];
function isCurrentPath(pathname: string, href: string) {
  return (
    pathname === href ||
    (href === "/records" && pathname === "/training") ||
    (href === "/progress" && ["/heatmap", "/overview"].includes(pathname))
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loadingFoods, preferences, refreshFoods, signOut, syncState, user } =
    useApp();
  const today = useZonedToday(preferences.timeZone);
  const activeItem =
    [...navigation, ...secondary].find((item) =>
      isCurrentPath(pathname, item.href),
    ) ?? navigation[0];
  const syncLabel =
    syncState === "error"
      ? "暂未同步，请稍后重试"
      : syncState === "schema-required"
        ? "部分服务暂不可用"
        : syncState === "loading"
          ? "同步中…"
          : "数据已连接";
  return (
    <FoodShortcutsProvider key={user.id} userId={user.id}>
      <div className="app-frame min-h-dvh lg:pl-[224px]">
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col px-4 py-7 lg:flex">
          <Link
            className="flex items-center gap-3 px-3 pb-8"
            href="/today"
            aria-label="NutriTrain 今日饮食"
          >
            <BrandMark size={34} />
            <span className="text-lg font-semibold tracking-tight">
              NutriTrain
            </span>
          </Link>
          <nav className="flex flex-col gap-1.5" aria-label="主导航">
            {navigation.map((item) => (
              <Link
                key={item.href}
                className={`app-nav-item ${isCurrentPath(pathname, item.href) ? "is-active" : ""}`}
                href={item.href}
                aria-current={
                  isCurrentPath(pathname, item.href) ? "page" : undefined
                }
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <nav
            className="mt-7 space-y-1 border-t border-line pt-5"
            aria-label="其他功能"
          >
            {secondary.map((item) => (
              <Link
                key={item.href}
                className={`app-nav-item ${pathname === item.href ? "is-active" : ""}`}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-line pt-4">
            <p className="truncate px-3 text-xs text-muted">{user.email}</p>
            <p className="px-3 py-2 text-xs text-muted" role="status">
              {syncLabel}
            </p>
            <button
              className="app-utility-button"
              type="button"
              onClick={() => void refreshFoods()}
              disabled={loadingFoods}
            >
              <RefreshCw
                size={16}
                className={loadingFoods ? "animate-spin" : ""}
              />
              刷新食物库
            </button>
            <button
              className="app-utility-button"
              type="button"
              onClick={signOut}
            >
              <LogOut size={16} />
              退出登录
            </button>
          </div>
        </aside>
        <header className="flex min-h-16 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
          <Link
            className="flex items-center gap-2.5 font-semibold"
            href="/today"
          >
            <BrandMark size={28} />
            {activeItem.label}
          </Link>
          <Link className="icon-button" href="/settings" aria-label="偏好设置">
            <Settings2 size={19} />
          </Link>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1440px] px-4 py-5 pb-28 md:px-7 lg:px-10 lg:py-8 lg:pb-10"
        >
          <header className="page-masthead mb-6 hidden items-center justify-between gap-6 lg:flex">
            <h1 className="text-[28px] text-ink">{activeItem.label}</h1>
            <span className="text-sm text-muted">
              {formatDateKey(today, preferences.locale, {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
          </header>
          {children}
        </main>
        <nav
          className="mobile-dock fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden"
          aria-label="移动主导航"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              className={`mobile-nav-item ${isCurrentPath(pathname, item.href) ? "is-active" : ""}`}
              href={item.href}
              aria-current={
                isCurrentPath(pathname, item.href) ? "page" : undefined
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </FoodShortcutsProvider>
  );
}
