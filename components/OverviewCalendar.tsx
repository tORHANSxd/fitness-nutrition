"use client";

import type { User } from "@supabase/supabase-js";
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Dumbbell, LayoutGrid, TrendingUp, Utensils } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { carbDayLabels, round } from "@/lib/nutrition";
import { loadPlans } from "@/lib/storage";
import { carbDayLabelsForTraining, muscleGroupLabels, muscleGroupOrder, toDateKey, weekStartKey, weeklyWorkingSets } from "@/lib/training";
import { loadWorkoutSessions, TrainingAuthError } from "@/lib/trainingStorage";
import type { CarbDayType, FoodItem, SavedPlan, WorkoutSession } from "@/lib/types";

interface OverviewCalendarProps {
  user: User | null;
  onEditPlanner: (date: string, plan: SavedPlan | null) => void;
  onEditTraining: (date: string) => void;
}

const carbDayDotClass: Record<CarbDayType, string> = {
  high: "bg-accent",
  mid: "bg-accent/45",
  low: "bg-[#CFCABD]"
};

function monthMatrix(cursor: Date): Array<{ date: Date; key: string; inMonth: boolean }> {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const cell = new Date(year, month, 1 - startOffset);
  const cells: Array<{ date: Date; key: string; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i += 1) {
    cells.push({ date: new Date(cell), key: toDateKey(cell), inMonth: cell.getMonth() === month });
    cell.setDate(cell.getDate() + 1);
  }
  return cells;
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel/40 p-3">
      <div className="flex items-center gap-1.5 text-muted">
        {icon}
        <span className="metric-label">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted">{hint}</div> : null}
    </div>
  );
}

function Sparkline({ data }: { data: Array<{ date: string; value: number }> }) {
  if (data.length < 2) {
    return <p className="text-xs text-muted">体重数据不足；在训练记录里填写体重即可生成趋势线。</p>;
  }
  const w = 280;
  const h = 60;
  const pad = 6;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (d.value - min) / range) * (h - 2 * pad);
    return { x, y };
  });
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const first = data[0].value;
  const latest = data[data.length - 1].value;
  const delta = round(latest - first, 1);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xl font-semibold text-ink">{latest} kg</span>
        <span className={`text-xs ${delta < 0 ? "text-emerald-400" : delta > 0 ? "text-rose" : "text-muted"}`}>
          {delta > 0 ? "+" : ""}{delta} kg / 近 {data.length} 次
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 w-full" preserveAspectRatio="none" role="img" aria-label="体重趋势">
        <path d={path} fill="none" stroke="rgb(168,130,255)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last.x} cy={last.y} r={3} fill="rgb(168,130,255)" />
      </svg>
    </div>
  );
}

export function OverviewCalendar({ user, onEditPlanner, onEditTraining }: OverviewCalendarProps) {
  const todayKey = toDateKey(new Date());
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monthRange = useMemo(() => {
    const from = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 2, 1);
    const to = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 2, 0);
    return { from: toDateKey(from), to: toDateKey(to) };
  }, [monthCursor]);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }
    setError(null);
    try {
      const [sessionData, planData] = await Promise.all([loadWorkoutSessions(user, monthRange.from, monthRange.to), loadPlans(user)]);
      setSessions(sessionData);
      setPlans(planData);
    } catch (err) {
      setError(err instanceof TrainingAuthError ? err.message : "加载总览失败，请检查 Supabase 连接。");
    }
  }, [user, monthRange.from, monthRange.to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sessionsByDate = useMemo(() => new Map(sessions.map((s) => [s.sessionDate, s])), [sessions]);
  const plansByDate = useMemo(() => new Map(plans.map((p) => [p.planDate, p])), [plans]);
  const cells = useMemo(() => monthMatrix(monthCursor), [monthCursor]);

  const weekStart = weekStartKey(todayKey);
  const weeklySets = useMemo(() => weeklyWorkingSets(sessions, weekStart), [sessions, weekStart]);
  const totalWeeklySets = useMemo(() => muscleGroupOrder.reduce((sum, m) => sum + weeklySets[m], 0), [weeklySets]);

  const stats = useMemo(() => {
    const kcals = plans.map((p) => p.result.dailyTarget.kcal).filter((k) => k > 0);
    const avgKcal = kcals.length ? Math.round(kcals.reduce((a, b) => a + b, 0) / kcals.length) : 0;

    // 连续训练天数（从今天往前数）
    let streak = 0;
    const cursor = new Date(`${todayKey}T00:00:00`);
    while (sessionsByDate.has(toDateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { avgKcal, streak };
  }, [plans, sessionsByDate, todayKey]);

  const bodyweightSeries = useMemo(() => {
    return sessions
      .filter((s) => typeof s.bodyweightKg === "number" && s.bodyweightKg)
      .map((s) => ({ date: s.sessionDate, value: s.bodyweightKg as number }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [sessions]);

  const agenda = useMemo(() => {
    const out: Array<{ key: string; date: Date; session?: WorkoutSession; plan?: SavedPlan }> = [];
    const d = new Date(`${todayKey}T00:00:00`);
    for (let i = 0; i < 7; i += 1) {
      const key = toDateKey(d);
      out.push({ key, date: new Date(d), session: sessionsByDate.get(key), plan: plansByDate.get(key) });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [todayKey, sessionsByDate, plansByDate]);

  if (!user) {
    return (
      <section className="panel flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/[0.12] text-accent ring-1 ring-accent/25">
          <LayoutGrid size={26} />
        </div>
        <h2 className="text-lg font-semibold text-ink">总览需要登录</h2>
        <p className="max-w-sm text-sm text-muted">训练与饮食安排保存在 Supabase 云端，登录后可在此总览全部计划。</p>
      </section>
    );
  }

  const monthLabel = `${monthCursor.getFullYear()} 年 ${monthCursor.getMonth() + 1} 月`;
  const weekdayHeads = ["一", "二", "三", "四", "五", "六", "日"];
  const weekdayShort = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  return (
    <div className="flex flex-col gap-5">
      {/* 顶部统计概览卡 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={<Dumbbell size={14} />} label="本周训练组数" value={`${totalWeeklySets}`} hint={`${sessions.filter((s) => s.sessionDate >= weekStart && s.sessionDate <= todayKey).length} 次训练`} />
        <StatCard icon={<Utensils size={14} />} label="计划均热量" value={stats.avgKcal ? `${stats.avgKcal}` : "—"} hint="近期 daily_plans 目标均值 kcal" />
        <StatCard icon={<Activity size={14} />} label="连续训练" value={`${stats.streak} 天`} hint="截至今天" />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 月视图（全宽格子） */}
        <section className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-1.5 text-base font-semibold text-ink"><CalendarDays size={16} className="text-accent" /> 计划总览</h2>
              <p className="text-xs text-muted">点某天可跳转去编辑分餐或训练。</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-accent/50 hover:bg-accent/15 hover:text-accent" type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} aria-label="上个月">
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[104px] text-center text-sm font-medium text-ink">{monthLabel}</span>
              <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-accent/50 hover:bg-accent/15 hover:text-accent" type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} aria-label="下个月">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekdayHeads.map((d) => (
              <div key={d} className="py-1 text-center text-[11px] font-semibold text-muted">{d}</div>
            ))}
            {cells.map((cell) => {
              const session = sessionsByDate.get(cell.key);
              const plan = plansByDate.get(cell.key);
              const isToday = cell.key === todayKey;
              const isSelected = cell.key === selectedDate;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : cell.key)}
                  className={`flex min-h-[84px] flex-col rounded-lg border p-1.5 text-left transition-colors ${
                    isSelected ? "border-accent bg-accent/15" : cell.inMonth ? "border-line bg-black/[0.02] hover:border-accent/40" : "border-transparent opacity-55"
                  }`}
                >
                  <span className={`text-xs ${isToday ? "font-bold text-accent" : "text-ink"}`}>{cell.date.getDate()}</span>
                  {session ? (
                    <span className="mt-1 flex items-center gap-1 truncate text-[10px] text-ink">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${carbDayDotClass[session.carbDayType]}`} />
                      <span className="truncate">{session.splitLabel}</span>
                    </span>
                  ) : null}
                  {plan ? <span className="mt-auto truncate text-[10px] text-muted">🍚 {round(plan.result.dailyTarget.kcal, 0)}</span> : null}
                </button>
              );
            })}
          </div>
          {selectedDate ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel/40 px-3 py-2">
              <span className="text-sm font-medium text-ink">{selectedDate}</span>
              <span className="text-xs text-muted">
                {sessionsByDate.get(selectedDate) ? sessionsByDate.get(selectedDate)!.splitLabel : "无训练"} ·{" "}
                {plansByDate.get(selectedDate) ? `${round(plansByDate.get(selectedDate)!.result.dailyTarget.kcal, 0)} kcal` : "无饮食目标"}
              </span>
              <div className="ml-auto flex gap-2">
                <button className="btn-secondary h-8 px-2.5 text-xs" type="button" onClick={() => onEditTraining(selectedDate)}>去训练</button>
                <button className="btn-primary h-8 px-2.5 text-xs" type="button" onClick={() => onEditPlanner(selectedDate, plansByDate.get(selectedDate) ?? null)}>去分餐</button>
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent/45" />训练(标准日)</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent" />历史高碳</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#CFCABD]" />历史低碳</span>
            <span>🍚 = 饮食目标 kcal</span>
          </div>
          {error ? <p className="mt-3 rounded-lg border border-rose/35 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</p> : null}
        </section>

        {/* 右栏：体重趋势 + 本周肌群量 */}
        <div className="flex flex-col gap-5">
          <section className="panel p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-base font-semibold text-ink"><TrendingUp size={16} className="text-accent" /> 体重趋势</h2>
            <Sparkline data={bodyweightSeries} />
          </section>
          <section className="panel p-4">
            <h2 className="mb-2 text-base font-semibold text-ink">本周各肌群组数</h2>
            {totalWeeklySets === 0 ? (
              <p className="text-xs text-muted">本周还没有训练记录。</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {muscleGroupOrder.filter((m) => weeklySets[m] > 0).map((m) => (
                  <span key={m} className="rounded-full border border-line bg-surface/60 px-2 py-0.5 text-xs text-ink">
                    {muscleGroupLabels[m]} <span className="text-accent">{weeklySets[m]}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* 周/议程条：未来 7 天 */}
      <section className="panel p-4">
        <h2 className="mb-3 text-base font-semibold text-ink">未来 7 天议程</h2>
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          {agenda.map((item) => {
            const isToday = item.key === todayKey;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedDate(item.key)}
                className={`flex min-w-[150px] shrink-0 flex-col gap-1 rounded-xl border p-3 text-left transition-colors ${isToday ? "border-accent/50 bg-accent/[0.08]" : "border-line bg-surface/40 hover:border-accent/30"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">{weekdayShort[item.date.getDay()]}</span>
                  <span className="text-[10px] text-muted">{item.date.getMonth() + 1}/{item.date.getDate()}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-ink">
                  <Dumbbell size={11} className="text-muted" />
                  {item.session ? (
                    <span className="flex items-center gap-1 truncate">
                      <span className={`h-1.5 w-1.5 rounded-full ${carbDayDotClass[item.session.carbDayType]}`} />
                      {item.session.splitLabel}
                    </span>
                  ) : (
                    <span className="text-muted">未排</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted">
                  <Utensils size={11} />
                  {item.plan ? `${carbDayLabels[item.plan.result.carbDayType]} · ${round(item.plan.result.dailyTarget.kcal, 0)}kcal` : "未排饮食"}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
