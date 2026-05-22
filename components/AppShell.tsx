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
    <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-4 md:px-6 md:py-6">
      <header className="mb-4 flex flex-col gap-3 rounded-lg border border-line bg-white px-4 py-3 shadow-soft lg:flex-row lg:items-center lg:justify-between">
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

        <div className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                className={`btn h-9 ${
                  active ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:bg-slate-50"
                }`}
                type="button"
                onClick={() => setView(item.id)}
                title={item.label}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button className="btn-secondary h-9" type="button" onClick={refreshFoods} title="刷新食物库">
            <RefreshCw size={16} className={loadingFoods ? "animate-spin" : ""} />
            <span>刷新</span>
          </button>
          {user ? (
            <button className="btn-secondary h-9" type="button" onClick={signOut} title="退出登录">
              <LogOut size={16} />
              <span>退出</span>
            </button>
          ) : null}
        </div>
      </header>

      {!authReady ? (
        <section className="panel flex min-h-[420px] items-center justify-center text-muted">正在初始化...</section>
      ) : null}

      {authReady && view === "login" ? <AuthPanel user={user} onSignedIn={setUser} /> : null}
      {authReady && view === "planner" ? (
        <NutritionPlanner foods={foods} user={user} onFoodsChanged={refreshFoods} />
      ) : null}
      {authReady && view === "foods" ? (
        <FoodLibrary foods={foods} user={user} onFoodsChanged={refreshFoods} onFoodsUpdated={setFoods} />
      ) : null}
      {authReady && view === "history" ? <HistoryView user={user} /> : null}
    </main>
  );
}

