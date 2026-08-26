"use client";

import type { User } from "@supabase/supabase-js";
import { CalendarClock, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateKey } from "@/lib/dateTime";
import { round, trainingTimeLabels } from "@/lib/nutrition";
import { displayEnergy, type AppLocale, type EnergyUnit } from "@/lib/preferences";
import { deletePlan, loadPlans } from "@/lib/storage";
import type { SavedPlan } from "@/lib/types";

interface HistoryViewProps {
  user: User | null;
  locale?: AppLocale;
  energyUnit?: EnergyUnit;
}

export function HistoryView({ user, locale = "zh-CN", energyUnit = "kcal" }: HistoryViewProps) {
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const energyLabel = energyUnit === "kj" ? "kJ" : "kcal";

  async function refresh() {
    if (!user) {
      return;
    }
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

  async function removePlan(plan: SavedPlan) {
    if (!window.confirm(`确定删除 ${plan.planDate} 的计划记录？此操作不可撤销。`)) {
      return;
    }
    setDeletingId(plan.id);
    setMessage("");
    try {
      await deletePlan(plan.id, user);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      setMessage(`已删除 ${plan.planDate} 的记录。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setDeletingId(null);
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
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent-text">
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
      {message ? (
        <p className={`m-4 rounded-md p-3 text-sm ${message.includes("失败") ? "bg-rose/10 text-danger" : "border border-line bg-surface/80 text-ink"}`} role={message.includes("失败") ? "alert" : "status"} aria-live="polite">
          {message}
        </p>
      ) : null}
      <div className="min-w-0">
        <table className="w-full table-fixed text-left text-xs sm:text-sm lg:table-auto">
          <thead className="border-b border-line text-[11px] uppercase text-muted-soft">
            <tr>
              <th className="w-[38%] px-3 py-3 sm:px-4 lg:w-auto">日期</th>
              <th className="hidden px-4 py-3 lg:table-cell">训练时间</th>
              <th className="hidden px-3 py-3 sm:table-cell sm:px-4">当日目标热量</th>
              <th className="px-3 py-3 sm:px-4">当前热量</th>
              <th className="hidden px-4 py-3 lg:table-cell">碳水</th>
              <th className="hidden px-4 py-3 lg:table-cell">蛋白</th>
              <th className="hidden px-4 py-3 lg:table-cell">脂肪</th>
              <th className="w-16 px-2 py-3 text-right sm:px-4 lg:w-auto">操作</th>
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
              plans.map((plan, index) => (
                <tr
                  key={plan.id}
                  className="border-t border-line animate-fade-up transition-colors hover:bg-panel/40"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <td className="break-words px-3 py-3 font-medium leading-tight text-ink sm:px-4">{formatDateKey(plan.planDate, locale, { year: "numeric", month: "short", day: "numeric" })}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">{trainingTimeLabels[plan.profile.trainingTime]}</td>
                  <td className="hidden whitespace-nowrap px-3 py-3 tabular-nums sm:table-cell sm:px-4">{round(displayEnergy(plan.result.dailyTarget.kcal, energyUnit), 0)} {energyLabel}</td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">{round(displayEnergy(plan.result.actualTotals.kcal, energyUnit), 0)} {energyLabel}</td>
                  <td className="hidden px-4 py-3 tabular-nums lg:table-cell">{round(plan.result.actualTotals.carbs)} g</td>
                  <td className="hidden px-4 py-3 tabular-nums lg:table-cell">{round(plan.result.actualTotals.protein)} g</td>
                  <td className="hidden px-4 py-3 tabular-nums lg:table-cell">{round(plan.result.actualTotals.fat)} g</td>
                  <td className="px-2 py-3 text-right sm:px-4">
                    <button
                      className="btn-danger h-11 w-11 p-0"
                      type="button"
                      onClick={() => removePlan(plan)}
                      disabled={deletingId === plan.id}
                      aria-label={`删除 ${plan.planDate} 的计划记录`}
                      title="删除该记录"
                    >
                      <Trash2 size={14} className={deletingId === plan.id ? "animate-pulse" : ""} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
