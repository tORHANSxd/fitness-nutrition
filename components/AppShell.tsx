"use client";

import type { User } from "@supabase/supabase-js";
import { BarChart3, CalendarClock, Dumbbell, LayoutTemplate, Library, LogIn, LogOut, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AuthPanel } from "@/components/AuthPanel";
import { FoodLibrary } from "@/components/FoodLibrary";
import { HistoryView } from "@/components/HistoryView";
import { NutritionPlanner } from "@/components/NutritionPlanner";
import { TemplateManager } from "@/components/TemplateManager";
import { builtinFoods } from "@/lib/foods";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { loadFoods, loadPlannerTemplates, savePlannerTemplates } from "@/lib/storage";
import type { FoodItem, PlannerTemplates, ViewName } from "@/lib/types";

interface AppShellProps {
  initialView: ViewName;
}

const navItems: Array<{ id: ViewName; label: string; shortLabel: string; icon: typeof Dumbbell }> = [
  { id: "planner", label: "当天计划", shortLabel: "计划", icon: Dumbbell },
  { id: "templates", label: "模板管理", shortLabel: "模板", icon: LayoutTemplate },
  { id: "foods", label: "食物库", shortLabel: "食物", icon: Library },
  { id: "history", label: "历史记录", shortLabel: "历史", icon: CalendarClock },
  { id: "login", label: "登录", shortLabel: "登录", icon: LogIn }
];

export function AppShell({ initialView }: AppShellProps) {
  const [view, setView] = useState<ViewName>(initialView);
  const [user, setUser] = useState<User | null>(null);
  const [foods, setFoods] = useState<FoodItem[]>(builtinFoods);
  const [templates, setTemplates] = useState<PlannerTemplates>({ mealTemplates: [], dayTemplates: [] });
  const [loadingFoods, setLoadingFoods] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const configured = isSupabaseConfigured();

  const refreshFoods = useCallback(async () => {
    setLoadingFoods(true);
    try {
      setFoods(await loadFoods(user));
    } finally {
      setLoadingFoods(false);
    }
  }, [user]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let mounted = true;
    const authFallback = new Promise<{ data: { user: User | null } }>((resolve) => {
      window.setTimeout(() => resolve({ data: { user: null } }), 3000);
    });

    Promise.race([supabase.auth.getUser(), authFallback])
      .then(({ data }) => {
        if (mounted) {
          setUser(data.user);
        }
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setAuthReady(true);
        }
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // 切屏/回到前台时 Supabase 会触发 TOKEN_REFRESHED 等事件并给出新的 user 对象引用；
      // 若身份未变（同一 user.id）则保持原引用，避免下游以 user 为依赖的副作用（分餐水合、
      // 食物/模板重载）被无谓重跑，从而修复“切屏后分餐计划跳回早餐”。
      const nextUser = session?.user ?? null;
      setUser((current) => (current?.id === nextUser?.id ? current : nextUser));
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    refreshFoods().catch(() => {
      setFoods(builtinFoods);
    });
  }, [refreshFoods]);

  useEffect(() => {
    setTemplates(loadPlannerTemplates(user));
  }, [user]);

  function persistTemplates(nextTemplates: PlannerTemplates) {
    setTemplates(savePlannerTemplates(user, nextTemplates));
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setView("login");
  }

  const userStatus = configured ? (user ? `已登录：${user.email}` : "Supabase 在线模式") : "本地演示模式";
  const activeLabel = navItems.find((item) => item.id === view)?.label ?? "当天计划";
  const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="relative z-10 min-h-dvh lg:pl-64">
      <a className="skip-link" href="#main-content">跳到主要内容</a>

      {/* 桌面：固定左侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/70 px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/[0.12] text-accent ring-1 ring-accent/25">
            <BarChart3 size={20} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-ink">健身营养</div>
            <div className="text-xs text-muted">碳循环计划器</div>
          </div>
        </div>

        <nav className="mt-8 flex flex-col gap-1" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  active ? "bg-neon-grad text-white shadow-glow-neon" : "text-muted hover:bg-white/[0.05] hover:text-ink"
                }`}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-6">
          <div className="rounded-lg border border-line bg-ground/50 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${configured && user ? "bg-accent" : "bg-muted"}`} />
              <span className="truncate text-xs text-muted">{userStatus}</span>
            </div>
          </div>
          <button className="btn-secondary h-10 justify-start px-3" type="button" onClick={refreshFoods} title="刷新食物库">
            <RefreshCw size={16} className={loadingFoods ? "animate-spin" : ""} />
            <span>刷新数据</span>
          </button>
          {user ? (
            <button className="btn-secondary h-10 justify-start px-3" type="button" onClick={signOut} title="退出登录">
              <LogOut size={16} />
              <span>退出登录</span>
            </button>
          ) : null}
        </div>
      </aside>

      {/* 移动/平板：顶部细 bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-ground/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/[0.12] text-accent ring-1 ring-accent/25">
            <BarChart3 size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-ink">{activeLabel}</div>
            <div className="truncate text-[11px] text-muted">{userStatus}</div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="btn-secondary h-9 px-3" type="button" onClick={refreshFoods} title="刷新食物库">
            <RefreshCw size={16} className={loadingFoods ? "animate-spin" : ""} />
          </button>
          {user ? (
            <button className="btn-secondary h-9 px-3" type="button" onClick={signOut} title="退出登录">
              <LogOut size={16} />
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-4 py-6 pb-28 md:px-8 lg:pb-12">
        {/* 桌面页头 */}
        <div className="mb-6 hidden items-end justify-between gap-4 lg:flex">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{activeLabel}</h1>
            <p className="mt-1 text-sm text-muted">{userStatus}</p>
          </div>
          <p className="text-sm text-muted">{today}</p>
        </div>

        {!authReady ? (
          <section className="panel flex min-h-[420px] items-center justify-center text-muted">正在初始化…</section>
        ) : null}

        {authReady ? (
          <div id="main-content">
            <div className={view === "login" ? "animate-view" : "hidden"}>
              <AuthPanel user={user} onSignedIn={setUser} />
            </div>
            <div className={view === "planner" ? "animate-view" : "hidden"}>
              <NutritionPlanner foods={foods} templates={templates} user={user} onFoodsChanged={refreshFoods} onTemplatesChanged={persistTemplates} />
            </div>
            <div className={view === "templates" ? "animate-view" : "hidden"}>
              <TemplateManager templates={templates} onTemplatesChanged={persistTemplates} />
            </div>
            <div className={view === "foods" ? "animate-view" : "hidden"}>
              <FoodLibrary foods={foods} user={user} onFoodsChanged={refreshFoods} onFoodsUpdated={setFoods} />
            </div>
            <div className={view === "history" ? "animate-view" : "hidden"}>
              <HistoryView user={user} />
            </div>
          </div>
        ) : null}
      </main>

      {/* 移动端底部导航 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-1 border-t border-line bg-ground/85 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-muted hover:text-ink"
              }`}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={active ? "page" : undefined}
            >
              {active ? <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent" /> : null}
              <Icon size={18} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
