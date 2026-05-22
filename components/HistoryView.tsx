"use client";

import type { User } from "@supabase/supabase-js";
import { CalendarClock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { carbDayLabels, round, workoutLabels } from "@/lib/nutrition";
import { loadPlans } from "@/lib/storage";
import type { SavedPlan } from "@/lib/types";

interface HistoryViewProps {
  user: User | null;
}

export function HistoryView({ user }: HistoryViewProps) {
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      setPlans(await loadPlans(user));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取历史失败。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
            <CalendarClock size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink">历史记录</h2>
            <p className="text-sm text-muted">显示最近 30 条已保存计划。</p>
          </div>
        </div>
        <button className="btn-secondary" type="button" onClick={refresh}>
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
          刷新
        </button>
      </div>
      {message ? <p className="m-4 rounded-md bg-rose/10 p-3 text-sm text-rose">{message}</p> : null}
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-panel text-xs uppercase tracking-normal text-muted">
            <tr>
              <th className="px-4 py-3">日期</th>
              <th className="px-4 py-3">训练</th>
              <th className="px-4 py-3">碳日</th>
              <th className="px-4 py-3">当日目标热量</th>
              <th className="px-4 py-3">当前热量</th>
              <th className="px-4 py-3">碳水</th>
              <th className="px-4 py-3">蛋白</th>
              <th className="px-4 py-3">脂肪</th>
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={8}>
                  暂无保存记录。
                </td>
              </tr>
            ) : (
              plans.map((plan) => (
                <tr key={plan.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-ink">{plan.planDate}</td>
                  <td className="px-4 py-3">{workoutLabels[plan.profile.workoutType]}</td>
                  <td className="px-4 py-3">{carbDayLabels[plan.result.carbDayType]}</td>
                  <td className="px-4 py-3">{round(plan.result.dailyTarget.kcal, 0)} kcal</td>
                  <td className="px-4 py-3">{round(plan.result.actualTotals.kcal, 0)} kcal</td>
                  <td className="px-4 py-3">{round(plan.result.actualTotals.carbs)} g</td>
                  <td className="px-4 py-3">{round(plan.result.actualTotals.protein)} g</td>
                  <td className="px-4 py-3">{round(plan.result.actualTotals.fat)} g</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
