import { Temporal } from "@js-temporal/polyfill";
import type { MacroTotals, PlanProtocol } from "@/lib/types";

export type NutritionStrategy = { version: 1; mode: "fixed_daily" } | {
  version: 1; mode: "weekly_cycle"; isoWeekdaysTraining: number[];
  trainingTarget: MacroTotals; restTarget: MacroTotals;
  weeklyTargetKcal: number; startAfterStableLoggingDays: number;
};

function target(value: unknown): MacroTotals {
  const t = value as MacroTotals | null;
  if (!t || [t.kcal, t.protein, t.carbs, t.fat].some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0)
    || t.kcal <= 0 || t.kcal > 10000 || Math.abs(t.kcal - t.protein * 4 - t.carbs * 4 - t.fat * 9) > 1e-6) throw new Error("周期目标能量与宏量不一致。");
  return { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs };
}

export function parseNutritionStrategy(value: unknown, average: MacroTotals): NutritionStrategy {
  const s = value as NutritionStrategy | null;
  if (!s || s.version !== 1) throw new Error("营养周期版本无效。");
  if (s.mode === "fixed_daily") return { version: 1, mode: "fixed_daily" };
  if (s.mode !== "weekly_cycle" || !Array.isArray(s.isoWeekdaysTraining) || s.isoWeekdaysTraining.length < 1 || s.isoWeekdaysTraining.length > 6
    || new Set(s.isoWeekdaysTraining).size !== s.isoWeekdaysTraining.length || s.isoWeekdaysTraining.some(d => !Number.isInteger(d) || d < 1 || d > 7)
    || !Number.isInteger(s.startAfterStableLoggingDays) || s.startAfterStableLoggingDays < 14 || s.startAfterStableLoggingDays > 90) throw new Error("每周营养策略配置无效。");
  const trainingTarget = target(s.trainingTarget), restTarget = target(s.restTarget), n = s.isoWeekdaysTraining.length;
  for (const key of ["kcal", "protein", "carbs", "fat"] as const) if (Math.abs((trainingTarget[key] * n + restTarget[key] * (7 - n)) / 7 - average[key]) > 1e-6) throw new Error("训练天数或目标改变，请重新平衡并确认周预算。");
  if (Math.abs(s.weeklyTargetKcal - average.kcal * 7) > 1e-6) throw new Error("周预算与平均目标不一致。");
  return { version: 1, mode: "weekly_cycle", isoWeekdaysTraining: [...s.isoWeekdaysTraining].sort((a, b) => a - b), trainingTarget, restTarget, weeklyTargetKcal: s.weeklyTargetKcal, startAfterStableLoggingDays: s.startAfterStableLoggingDays };
}

export function dailyTargetForDate(protocol: PlanProtocol, date: string): MacroTotals {
  const weekday = Temporal.PlainDate.from(date).dayOfWeek;
  const s = protocol.schemaVersion === 3 ? protocol.nutritionStrategy : undefined;
  return { ...(s?.mode === "weekly_cycle" ? s.isoWeekdaysTraining.includes(weekday) ? s.trainingTarget : s.restTarget : protocol.dailyTarget) };
}
