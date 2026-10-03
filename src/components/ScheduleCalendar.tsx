"use client";
import type { User } from "@supabase/supabase-js";
import { ChevronLeft, ChevronRight, Dumbbell, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useZonedToday } from "@/hooks/useZonedToday";
import {
  addMonths,
  formatDateKey,
  monthGrid,
  monthKey,
  weekdayLabels,
} from "@/lib/dateTime";
import { loadPlansInRange } from "@/lib/storage";
import { loadWorkoutSessions } from "@/lib/trainingStorage";
import type { FoodItem, SavedPlan, WorkoutSession } from "@/lib/types";
import {
  displayEnergy,
  type AppLocale,
  type EnergyUnit,
} from "@/lib/preferences";

interface ScheduleCalendarProps {
  user: User | null;
  foods: FoodItem[];
  onGoTraining: (date: string) => void;
  onGoPlanner: (date: string, plan: SavedPlan | null) => void;
  timeZone: string;
  locale: AppLocale;
  weekStartsOn: number;
  energyUnit: EnergyUnit;
}
export function ScheduleCalendar({
  user,
  onGoTraining,
  onGoPlanner,
  timeZone,
  locale,
  weekStartsOn,
  energyUnit,
}: ScheduleCalendarProps) {
  const today = useZonedToday(timeZone);
  const [month, setMonth] = useState(monthKey(today));
  const [selected, setSelected] = useState(today);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const days = useMemo(
    () => monthGrid(month, weekStartsOn),
    [month, weekStartsOn],
  );
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    Promise.all([
      loadPlansInRange(user, days[0], days[days.length - 1]),
      loadWorkoutSessions(user, days[0], days[days.length - 1]),
    ])
      .then(([p, s]) => {
        if (live) {
          setPlans(p);
          setSessions(s);
        }
      })
      .catch(() => {
        if (live) {
          setError("日历读取失败，请稍后重试。");
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [days, user, reload]);
  const plan = plans.find((p) => p.planDate === selected);
  const session = sessions.find((s) => s.sessionDate === selected);
  return (
    <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="panel p-4 sm:p-5">
        <header className="mb-5 flex items-center justify-between">
          <h2 className="text-lg">
            {formatDateKey(month, locale, { year: "numeric", month: "long" })}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="icon-button"
              aria-label="上个月"
              onClick={() => setMonth(addMonths(month, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="btn-text px-3 text-sm"
              onClick={() => {
                setMonth(monthKey(today));
                setSelected(today);
              }}
            >
              今天
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="下个月"
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </header>
        <div className="calendar-grid">
          {weekdayLabels(locale, weekStartsOn).map((label) => (
            <div className="py-2 text-center text-xs text-muted" key={label}>
              {label}
            </div>
          ))}
          {days.map((day) => {
            const hasPlan = plans.some((p) => p.planDate === day);
            const hasSession = sessions.some((s) => s.sessionDate === day);
            return (
              <button
                type="button"
                key={day}
                className={`calendar-cell ${selected === day ? "is-selected" : ""} ${day.startsWith(month.slice(0, 7)) ? "" : "is-outside"}`}
                aria-label={`${day}${hasPlan ? " 有饮食计划" : ""}${hasSession ? " 有训练记录" : ""}`}
                aria-pressed={selected === day}
                onClick={() => setSelected(day)}
              >
                <span className={day === today ? "calendar-today" : ""}>
                  {Number(day.slice(-2))}
                </span>
                <span className="mt-3 flex justify-center gap-1.5">
                  {hasPlan && <span className="calendar-dot bg-accent2" />}
                  {hasSession && <span className="calendar-dot bg-blue-800" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-2">
            <i className="calendar-dot bg-accent2" />
            饮食计划
          </span>
          <span className="flex items-center gap-2">
            <i className="calendar-dot bg-blue-800" />
            训练记录
          </span>
        </div>
        {loading && (
          <p className="mt-3 text-xs text-muted" role="status">
            正在读取…
          </p>
        )}
        {error && (
          <div
            className="mt-3 flex items-center gap-3 text-sm text-danger"
            role="alert"
          >
            <span>{error}</span>
            <button
              className="btn-text"
              type="button"
              onClick={() => setReload((n) => n + 1)}
            >
              重试
            </button>
          </div>
        )}
      </section>
      <section className="panel p-5">
        <h2 className="mb-5 text-lg">
          {formatDateKey(selected, locale, {
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </h2>
        <div className="space-y-6">
          <div>
            <h3 className="flex items-center gap-2 text-sm">
              <Utensils size={16} />
              饮食
            </h3>
            <p className="my-3 text-sm text-muted">
              {plan
                ? `${plan.meals.length} 餐 · ${Math.round(displayEnergy(plan.result.actualTotals.kcal, energyUnit))} ${energyUnit === "kj" ? "kJ" : "kcal"} 计划摄入`
                : error
                  ? "暂时无法读取该日计划"
                  : "还没有保存餐食计划"}
            </p>
            <button
              className="btn-secondary w-full"
              type="button"
              onClick={() => onGoPlanner(selected, plan ?? null)}
            >
              {plan ? "查看餐食" : "安排餐食"}
            </button>
          </div>
          <div className="border-t border-line pt-5">
            <h3 className="flex items-center gap-2 text-sm">
              <Dumbbell size={16} />
              训练
            </h3>
            <p className="my-3 text-sm text-muted">
              {session
                ? `${session.splitLabel || "训练记录"} · ${session.sets.length} 组`
                : error
                  ? "暂时无法读取该日记录"
                  : "还没有训练记录"}
            </p>
            <button
              className="btn-secondary w-full"
              type="button"
              onClick={() => onGoTraining(selected)}
              disabled={selected > today}
            >
              {session ? "查看记录" : "记录训练"}
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}
