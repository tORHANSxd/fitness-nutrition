import { Temporal } from "@js-temporal/polyfill";
import type { MacroTotals, PlanProtocol, UserProfile } from "@/lib/types";

export function parseDailyEnergyAdjustment(value: unknown): NonNullable<UserProfile["dailyEnergyAdjustment"]> {
  const a = value as UserProfile["dailyEnergyAdjustment"];
  if (!a || typeof a.tdeeKcal !== "number" || !Number.isFinite(a.tdeeKcal) || a.tdeeKcal <= 0 || a.tdeeKcal > 10000
    || typeof a.deficitKcal !== "number" || !Number.isFinite(a.deficitKcal) || a.deficitKcal < 0 || a.deficitKcal >= a.tdeeKcal) throw new Error("维持热量须为 0–10,000 kcal 之间的正数；缺口须非负且小于维持热量。");
  return { tdeeKcal: a.tdeeKcal, deficitKcal: a.deficitKcal };
}

export function adjustDailyEnergy(base: MacroTotals, adjustment?: UserProfile["dailyEnergyAdjustment"]): MacroTotals {
  if (!adjustment) return { ...base };
  const { tdeeKcal, deficitKcal } = parseDailyEnergyAdjustment(adjustment);
  const kcal = tdeeKcal - deficitKcal;
  const carbs = (kcal - base.protein * 4 - base.fat * 9) / 4;
  if (carbs < 0) throw new Error("蛋白质和脂肪已超过当天热量预算，请减小缺口或调整蛋白质、脂肪目标。");
  return { kcal, protein: base.protein, fat: base.fat, carbs };
}

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

export function dailyTargetForDate(protocol: PlanProtocol, date: string, adjustment?: UserProfile["dailyEnergyAdjustment"]): MacroTotals {
  const weekday = Temporal.PlainDate.from(date).dayOfWeek;
  const s = protocol.schemaVersion === 3 ? protocol.nutritionStrategy : undefined;
  return adjustDailyEnergy(s?.mode === "weekly_cycle" ? s.isoWeekdaysTraining.includes(weekday) ? s.trainingTarget : s.restTarget : protocol.dailyTarget, adjustment);
}
