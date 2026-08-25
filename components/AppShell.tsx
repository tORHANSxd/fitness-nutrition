"use client";

import {
  BarChart3,
  CalendarDays,
  Dumbbell,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Utensils,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { useApp } from "@/components/app/AppProvider";
import { useZonedToday } from "@/hooks/useZonedToday";
import { formatDateKey } from "@/lib/dateTime";

const navigation = [
  { href: "/overview", labelKey: "nav.overview", icon: LayoutDashboard },
  { href: "/today", labelKey: "nav.today", icon: Utensils },
  { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays },
  { href: "/training", labelKey: "nav.training", icon: Dumbbell },
  { href: "/progress", labelKey: "nav.progress", icon: BarChart3 },
  { href: "/resources", labelKey: "nav.resources", icon: Library },
  { href: "/settings", labelKey: "nav.settings", icon: Settings }
] as const;

const mobilePrimary = navigation.filter((item) => ["/overview", "/today", "/training", "/progress"].includes(item.href));
const moreNavigation = navigation.filter((item) => ["/calendar", "/resources", "/settings"].includes(item.href));

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loadingFoods, preferences, refreshFoods, signOut, syncState, t, user } = useApp();
  const today = useZonedToday(preferences.timeZone);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const activeItem = navigation.find((item) => isCurrentPath(pathname, item.href)) ?? navigation[0];

  useEffect(() => {
    if (!moreOpen) {
      return;
    }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : moreButtonRef.current;
    const sheet = sheetRef.current;
    const focusable = sheet?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    focusable?.[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [moreOpen]);

  useEffect(() => setMoreOpen(false), [pathname]);

  const syncLabel = t(`sync.${syncState === "schema-required" ? "schemaRequired" : syncState}`);

  return (
    <div className="app-frame min-h-dvh lg:pl-[248px]">
      <a className="skip-link" href="#main-content">跳到主要内容</a>

      <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col px-4 py-5 lg:flex">
        <Link className="flex items-center gap-3 border-b border-white/15 px-2 pb-5" href="/overview" aria-label="NutriTrain 总览">
          <BrandMark size={34} />
          <div className="min-w-0 leading-tight">
            <div className="font-display text-[17px] text-white">NUTRITRAIN</div>
            <div className="mt-1 font-mono text-[9px] text-white/45">TRAIN · FUEL · ADAPT</div>
          </div>
        </Link>

        <nav className="mt-6 flex flex-col gap-1" aria-label="主导航">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isCurrentPath(pathname, item.href);
            return (
              <Link
                key={item.href}
                className={`app-nav-item group relative flex min-h-11 items-center gap-3 rounded px-3 text-[13px] ${
                  active ? "bg-white/[0.09] font-semibold text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                }`}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} className={active ? "text-accent" : "text-white/45"} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/15 pt-4">
          <div className="mb-2 px-2.5">
            <p className="truncate text-xs text-white/65">{user.email}</p>
            <p className={`mt-1 text-[10px] ${syncState === "error" || syncState === "schema-required" ? "text-amber-300" : "text-white/40"}`} aria-live="polite">
              {syncLabel}
            </p>
          </div>
          <button className="app-utility-button" type="button" onClick={() => refreshFoods()} disabled={loadingFoods}>
            <RefreshCw size={16} className={loadingFoods ? "animate-spin" : ""} />
            <span>{t("actions.refreshFoods")}</span>
          </button>
          <button className="app-utility-button" type="button" onClick={signOut}>
            <LogOut size={16} />
            <span>{t("actions.signOut")}</span>
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-line bg-ground/95 px-4 backdrop-blur lg:hidden">
        <Link className="flex min-w-0 items-center gap-2.5" href="/overview">
          <BrandMark size={30} />
          <div className="min-w-0">
            <div className="font-display text-[15px] leading-tight text-ink">{t(activeItem.labelKey)}</div>
            <div className="truncate text-[10px] text-muted">{formatDateKey(today, preferences.locale, { month: "short", day: "numeric", weekday: "short" })}</div>
          </div>
        </Link>
        <span className="max-w-[42vw] truncate text-[10px] text-muted" aria-live="polite">{syncLabel}</span>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-[1500px] px-4 py-6 pb-28 md:px-7 lg:px-9 lg:py-8 lg:pb-10">
        <header className="page-masthead mb-6 hidden items-end justify-between gap-6 pb-5 lg:flex">
          <h1 className="text-[34px] text-ink">{t(activeItem.labelKey)}</h1>
          <p className="text-xs text-muted">{formatDateKey(today, preferences.locale, { dateStyle: "full" })} · {preferences.timeZone}</p>
        </header>
        {children}
      </main>

      <nav className="mobile-dock fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden" aria-label="移动主导航">
        {mobilePrimary.map((item) => {
          const Icon = item.icon;
          const active = isCurrentPath(pathname, item.href);
          return (
            <Link key={item.href} className={`mobile-nav-item ${active ? "is-active" : ""}`} href={item.href} aria-current={active ? "page" : undefined}>
              <Icon size={19} />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
        <button
          ref={moreButtonRef}
          className={`mobile-nav-item ${moreOpen || moreNavigation.some((item) => isCurrentPath(pathname, item.href)) ? "is-active" : ""}`}
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-controls="more-menu-sheet"
        >
          <Menu size={19} />
          <span>{t("nav.more")}</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="sheet-overlay lg:hidden" onMouseDown={(event) => event.target === event.currentTarget && setMoreOpen(false)}>
          <div ref={sheetRef} id="more-menu-sheet" className="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="more-menu-title">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 id="more-menu-title" className="text-lg text-ink">{t("nav.more")}</h2>
              <button className="icon-button" type="button" onClick={() => setMoreOpen(false)} aria-label={t("actions.close")}>
                <X size={19} />
              </button>
            </div>
            <nav className="grid gap-1 p-3" aria-label="更多导航">
              {moreNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} className="flex min-h-12 items-center gap-3 rounded px-3 text-sm font-semibold text-ink hover:bg-panel" href={item.href}>
                    <Icon size={18} className="text-accent2" />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
              <button className="flex min-h-12 items-center gap-3 rounded px-3 text-left text-sm font-semibold text-rose hover:bg-rose/[0.08]" type="button" onClick={signOut}>
                <LogOut size={18} />
                {t("actions.signOut")}
              </button>
            </nav>
            <p className="border-t border-line px-4 py-3 text-xs text-muted" aria-live="polite">{syncLabel}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
