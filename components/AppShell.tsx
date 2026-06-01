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
      setUser(session?.user ?? null);
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1480px] flex-col px-3 py-3 pb-28 md:px-6 md:py-5 md:pb-6">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="sticky top-3 z-20 mb-4 rounded-lg border border-line bg-white/95 px-3 py-3 shadow-soft backdrop-blur md:px-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-white shadow-[0_10px_24px_rgba(30,64,175,0.22)]">
            <BarChart3 size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink md:text-xl">健身营养计划</h1>
            <p className="truncate text-sm text-muted">{userStatus}</p>
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                className={`btn h-11 px-3 ${
                  active ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:bg-blue-50"
                }`}
                type="button"
                onClick={() => setView(item.id)}
                title={item.label}
              >
                <Icon size={16} />
                <span className="min-w-0 truncate">{item.label}</span>
              </button>
            );
          })}
          <button className="btn-secondary h-11" type="button" onClick={refreshFoods} title="刷新食物库">
            <RefreshCw size={16} className={loadingFoods ? "animate-spin" : ""} />
            <span>刷新</span>
          </button>
          {user ? (
            <button className="btn-secondary h-11" type="button" onClick={signOut} title="退出登录">
              <LogOut size={16} />
              <span>退出</span>
            </button>
          ) : null}
        </div>
        <div className="flex gap-2 md:hidden">
          <button className="btn-secondary h-11 flex-1" type="button" onClick={refreshFoods} title="刷新食物库">
            <RefreshCw size={16} className={loadingFoods ? "animate-spin" : ""} />
            <span>刷新数据</span>
          </button>
          {user ? (
            <button className="btn-secondary h-11 flex-1" type="button" onClick={signOut} title="退出登录">
              <LogOut size={16} />
              <span>退出</span>
            </button>
          ) : null}
        </div>
        </div>
      </header>

      {!authReady ? (
        <section className="panel flex min-h-[420px] items-center justify-center text-muted">正在初始化...</section>
      ) : null}

      {authReady ? (
        <div id="main-content" className="space-y-4">
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

      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 gap-2 rounded-lg border border-line bg-white/95 p-2 shadow-soft backdrop-blur md:hidden" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border px-2 text-xs font-semibold transition-colors ${
                active ? "border-accent bg-accent text-white" : "border-transparent text-muted hover:bg-blue-50 hover:text-ink"
              }`}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={17} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
