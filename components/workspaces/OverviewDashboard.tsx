"use client";

import { ArrowRight, CalendarCheck2, Dumbbell, Scale, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useZonedToday } from "@/hooks/useZonedToday";
import { loadBodyLogs, type BodyLog } from "@/lib/bodyLogs";
import { addDays, formatDateKey } from "@/lib/dateTime";
import { displayEnergy, displayWeight } from "@/lib/preferences";
import { loadPlans } from "@/lib/storage";
import { loadWorkoutSessions } from "@/lib/trainingStorage";
import type { SavedPlan, WorkoutSession } from "@/lib/types";

export function OverviewDashboard() {
  const { preferences, user } = useApp();
  const today = useZonedToday(preferences.timeZone);
  const fromDate = addDays(today, -6);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [bodyLogs, setBodyLogs] = useState<BodyLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadPlans(user), loadWorkoutSessions(user, fromDate, today), loadBodyLogs(user, 30)])
      .then(([nextPlans, nextSessions, nextBodyLogs]) => {
        if (!cancelled) {
          setPlans(nextPlans);
          setSessions(nextSessions);
          setBodyLogs(nextBodyLogs);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, today, user]);

  const todayPlan = plans.find((plan) => plan.planDate === today);
  const todaySession = sessions.find((session) => session.sessionDate === today);
  const latestBodyLog = [...bodyLogs].sort((a, b) => b.logDate.localeCompare(a.logDate)).find((log) => log.weightKg != null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(fromDate, index)), [fromDate]);
  const kcalProgress = todayPlan?.result.dailyTarget.kcal
    ? Math.min(100, Math.round((todayPlan.result.actualTotals.kcal / todayPlan.result.dailyTarget.kcal) * 100))
    : 0;
  const energyLabel = preferences.energyUnit === "kj" ? "kJ" : "kcal";
  const nextAction = !todayPlan
    ? { href: "/today", label: "创建今日计划" }
    : !todaySession
      ? { href: "/training", label: "开始训练" }
      : { href: "/progress", label: "查看今日总结" };

  return (
    <section className="space-y-6">
      <section className="status-band" aria-labelledby="today-status-title">
        <div>
          <p className="eyebrow">{formatDateKey(today, preferences.locale, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h2 id="today-status-title" className="mt-2 text-2xl text-ink">{loading ? "正在恢复你的数据" : todayPlan ? "今天的计划已就绪" : "先安排今天，再开始记录"}</h2>
          <p className="mt-2 text-sm text-muted">{preferences.timeZone} · 最近 7 天摘要</p>
        </div>
        <Link className="btn-cta shrink-0" href={nextAction.href}>{nextAction.label}<ArrowRight size={17} /></Link>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <article className="metric-card">
          <Utensils size={19} className="text-accent2" />
          <p className="metric-label mt-4">今日营养</p>
          <p className="metric-number mt-1 text-3xl text-ink">{todayPlan ? `${kcalProgress}%` : "--"}</p>
          <p className="mt-2 text-xs text-muted">{todayPlan ? `${Math.round(displayEnergy(todayPlan.result.actualTotals.kcal, preferences.energyUnit))} / ${Math.round(displayEnergy(todayPlan.result.dailyTarget.kcal, preferences.energyUnit))} ${energyLabel}` : "尚未保存今日计划"}</p>
        </article>
        <article className="metric-card">
          <Dumbbell size={19} className="text-blue-800" />
          <p className="metric-label mt-4">今日训练</p>
          <p className="metric-number mt-1 text-3xl text-ink">{todaySession ? todaySession.sets.filter((set) => !set.isWarmup).length : "--"}</p>
          <p className="mt-2 text-xs text-muted">{todaySession ? `${todaySession.splitLabel || "训练"} · 有效组` : "尚未记录训练"}</p>
        </article>
        <article className="metric-card">
          <Scale size={19} className="text-rose" />
          <p className="metric-label mt-4">最近体重</p>
          <p className="metric-number mt-1 text-3xl text-ink">
            {latestBodyLog?.weightKg != null ? displayWeight(latestBodyLog.weightKg, preferences.unitSystem).toFixed(1) : "--"}
          </p>
          <p className="mt-2 text-xs text-muted">{latestBodyLog ? `${preferences.unitSystem === "imperial" ? "lb" : "kg"} · ${formatDateKey(latestBodyLog.logDate, preferences.locale, { month: "short", day: "numeric" })}` : "还没有体测记录"}</p>
        </article>
      </div>

      <section className="border-y border-line py-5" aria-labelledby="week-timeline-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id="week-timeline-title" className="text-lg text-ink">近 7 天</h3>
          <Link className="text-sm font-semibold text-accent2 hover:underline" href="/calendar">打开日历</Link>
        </div>
        <ol className="grid grid-cols-7 gap-1.5">
          {days.map((date) => {
            const hasPlan = plans.some((plan) => plan.planDate === date);
            const hasTraining = sessions.some((session) => session.sessionDate === date);
            return (
              <li key={date} className={`timeline-day ${date === today ? "is-today" : ""}`}>
                <span className="text-[10px] text-muted">{formatDateKey(date, preferences.locale, { weekday: "short" })}</span>
                <span className="mt-1 text-sm font-bold text-ink">{date.slice(-2)}</span>
                <span className="mt-2 flex min-h-4 justify-center gap-1" aria-label={`${hasPlan ? "有饮食计划" : "无饮食计划"}，${hasTraining ? "有训练记录" : "无训练记录"}`}>
                  {hasPlan ? <Utensils size={12} className="text-accent2" /> : null}
                  {hasTraining ? <CalendarCheck2 size={12} className="text-blue-800" /> : null}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}
