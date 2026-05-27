"use client";

import type { User } from "@supabase/supabase-js";
import { BarChart3, CalendarClock, Dumbbell, Library, LogIn, LogOut, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AuthPanel } from "@/components/AuthPanel";
import { FoodLibrary } from "@/components/FoodLibrary";
import { HistoryView } from "@/components/HistoryView";
import { NutritionPlanner } from "@/components/NutritionPlanner";
import { builtinFoods } from "@/lib/foods";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { loadFoods } from "@/lib/storage";
import type { FoodItem, ViewName } from "@/lib/types";

interface AppShellProps {
  initialView: ViewName;
}

const navItems: Array<{ id: ViewName; label: string; icon: typeof Dumbbell }> = [
  { id: "planner", label: "当天计划", icon: Dumbbell },
  { id: "foods", label: "食物库", icon: Library },
  { id: "history", label: "历史记录", icon: CalendarClock },
  { id: "login", label: "登录", icon: LogIn }
];

export function AppShell({ initialView }: AppShellProps) {
  const [view, setView] = useState<ViewName>(initialView);
  const [user, setUser] = useState<User | null>(null);
  const [foods, setFoods] = useState<FoodItem[]>(builtinFoods);
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

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    refreshFoods().catch(() => {
      setFoods(builtinFoods);
    });
  }, [refreshFoods]);

  async function signOut() {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setView("login");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-3 py-3 pb-24 md:px-6 md:py-6 md:pb-6">
      <header className="sticky top-3 z-20 mb-4 flex flex-col gap-3 rounded-lg border border-line bg-white/95 px-4 py-3 shadow-soft backdrop-blur lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-white">
            <BarChart3 size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink md:text-xl">健身营养计划</h1>
            <p className="truncate text-sm text-muted">
              {configured ? (user ? `已登录：${user.email}` : "Supabase 在线模式") : "本地演示模式：配置 Supabase 后在线保存"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 lg:flex lg:flex-wrap lg:items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                className={`btn h-11 px-2 ${
                  active ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:bg-panel"
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
          <button className="btn-secondary col-span-2 h-10 lg:col-span-1 lg:h-11" type="button" onClick={refreshFoods} title="刷新食物库">
            <RefreshCw size={16} className={loadingFoods ? "animate-spin" : ""} />
            <span>刷新</span>
          </button>
          {user ? (
            <button className="btn-secondary col-span-2 h-10 lg:col-span-1 lg:h-11" type="button" onClick={signOut} title="退出登录">
              <LogOut size={16} />
              <span>退出</span>
            </button>
          ) : null}
        </div>
      </header>

      {!authReady ? (
        <section className="panel flex min-h-[420px] items-center justify-center text-muted">正在初始化...</section>
      ) : null}

      {authReady ? (
        <div className="space-y-4">
          <div className={view === "login" ? "animate-view" : "hidden"}>
            <AuthPanel user={user} onSignedIn={setUser} />
          </div>
          <div className={view === "planner" ? "animate-view" : "hidden"}>
            <NutritionPlanner foods={foods} user={user} onFoodsChanged={refreshFoods} />
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
  );
}
