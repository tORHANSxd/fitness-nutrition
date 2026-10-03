import { Temporal } from "@js-temporal/polyfill";
import { isDateKey } from "@/lib/dateTime";
import { parseNutritionSnapshot } from "@/lib/nutritionGoals/snapshot";
import type { MacroRatio, MacroTotals, MealPlan, MealSchedule, PlanProtocol, UserProfile } from "@/lib/types";

export class UnsupportedDocumentError extends Error {
  constructor(message: string, public readonly rawDocument: unknown) { super(message); this.name = "UnsupportedDocumentError"; }
}

/** 保留原始未知版本，由调用方提供下载；绝不剥字段后保存。 */
export function assertDocument(value: unknown, maxBytes = 262144): void {
  const visit = (item: unknown, depth: number): void => {
    if (depth > 32) throw new Error("文档嵌套过深。");
    if (typeof item === "number" && !Number.isFinite(item)) throw new Error("文档含非有限数字。");
    if (item && typeof item === "object") Object.values(item).forEach((child) => visit(child, depth + 1));
  };
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > maxBytes) throw new Error("文档过大。");
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("文档对象格式无效。");
  return value as Record<string, unknown>;
}

export function boundedNumber(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} 无效。`);
  return value;
}

export function validTime(value: unknown): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("请输入有效的 HH:mm 钟点。");
  return value;
}

export function validZone(value: unknown): string {
  if (typeof value !== "string" || !value || /^[+-]/.test(value)) throw new Error("时区无效。");
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); } catch { throw new Error("IANA 时区无效。"); }
  return value;
}

export function parseMealSchedule(value: unknown): MealSchedule {
  const item = record(value);
  const start = validTime(item.start);
  const end = validTime(item.end);
  if (item.endDayOffset !== 0 && item.endDayOffset !== 1) throw new Error("跨午夜必须明确选择次日结束。");
  const minutes = Temporal.PlainTime.from(start).until(Temporal.PlainTime.from(end)).total("minutes") + item.endDayOffset * 1440;
  if (minutes <= 0 || minutes > 1440) throw new Error("时间窗口必须大于 0 且不超过 24 小时。");
  return { ...item, start, end, endDayOffset: item.endDayOffset };
}

export function parseAllocation(value: unknown): MacroRatio {
  const item = record(value);
  return { ...item, protein: boundedNumber(item.protein, 0, 1, "蛋白份额"), carbs: boundedNumber(item.carbs, 0, 1, "碳水份额"), fat: boundedNumber(item.fat, 0, 1, "脂肪份额") };
}

export function mealMetadata(value: unknown): Pick<MealPlan, "kind" | "schedule" | "targetAllocation"> {
  const item = record(value);
  if (item.kind != null && item.kind !== "main" && item.kind !== "snack") throw new Error("餐次类型无效。");
  return {
    ...(item.kind ? { kind: item.kind as "main" | "snack" } : {}),
    ...(item.schedule != null ? { schedule: parseMealSchedule(item.schedule) } : {}),
    ...(item.targetAllocation != null ? { targetAllocation: parseAllocation(item.targetAllocation) } : {}),
  };
}

export function targetFromKcal(kcal: number, protein: number, fat: number): MacroTotals {
  boundedNumber(kcal, 1, 10000, "目标能量");
  boundedNumber(protein, 0, 1000, "蛋白");
  boundedNumber(fat, 0, 1000, "脂肪");
  const carbs = (kcal - protein * 4 - fat * 9) / 4;
  if (carbs < 0) throw new Error("蛋白和脂肪的能量已超过总目标，请调整配置。");
  return { kcal, protein, fat, carbs };
}

export function parsePlanProtocol(value: unknown): PlanProtocol {
  assertDocument(value, 65536);
  const item = record(value);
  if (item.schemaVersion !== 1 && item.schemaVersion !== 2) throw new UnsupportedDocumentError("不支持的执行协议版本；原始内容已保留。", value);
  if (typeof item.id !== "string" || !/^[0-9a-f-]{36}$/i.test(item.id)
    || item.presetId !== "eveningTreRptV4" || item.targetMode !== "calibrated" || item.allocationMode !== "explicitMacros"
    || !isDateKey(String(item.effectiveFrom))) throw new Error("执行协议标识、模式或生效日期无效。");
  const daily = record(item.dailyTarget);
  const dailyTarget = targetFromKcal(boundedNumber(daily.kcal, 1, 10000, "能量"), boundedNumber(daily.protein, 0, 1000, "蛋白"), boundedNumber(daily.fat, 0, 1000, "脂肪"));
  if (typeof daily.carbs !== "number" || Math.abs(daily.carbs - dailyTarget.carbs) > 0.000001) throw new Error("目标能量与宏量不一致。");
  let nutrition: PlanProtocol["nutrition"];
  if (item.schemaVersion === 2) {
    try { nutrition = parseNutritionSnapshot(item.nutrition); }
    catch (error) { throw new UnsupportedDocumentError(error instanceof Error ? error.message : "营养快照无效，原文已保留。", value); }
    if (item.requestId !== item.id || nutrition.body.calculationDate > String(item.effectiveFrom) || nutrition.body.timeZone !== item.timeZone
      || (Object.keys(dailyTarget) as Array<keyof MacroTotals>).some(k => Math.abs(dailyTarget[k] - nutrition!.result.resolvedTarget![k]) > 1e-6)) throw new Error("协议请求标识、日期或冻结营养目标不一致。");
  } else if (item.nutrition != null || item.requestId != null) throw new UnsupportedDocumentError("旧协议不能携带新营养策略，请保留原文并升级协议版本。", value);
  const cycle = record(item.trainingCycle);
  if (cycle.id !== "rptAlternate8DayV4" || cycle.lengthDays !== 8 || cycle.phase !== "recovery" || !isDateKey(String(cycle.anchorDate))) throw new Error("训练循环配置无效。");
  if (!Array.isArray(item.mealSlots) || item.mealSlots.length < 1 || item.mealSlots.length > 12) throw new Error("协议餐次无效。");
  const mealSlots = item.mealSlots.map((raw) => {
    const slot = record(raw);
    if (typeof slot.id !== "string" || !slot.id || typeof slot.name !== "string" || slot.name.length > 80 || !["main", "snack"].includes(String(slot.kind))) throw new Error("协议餐次字段无效。");
    return { ...slot, id: slot.id, name: slot.name, kind: slot.kind as "main" | "snack", schedule: parseMealSchedule(slot.schedule), targetAllocation: parseAllocation(slot.targetAllocation) };
  });
  if (new Set(mealSlots.map((slot) => slot.id)).size !== mealSlots.length) throw new Error("餐次标识重复。");
  for (const key of ["protein", "carbs", "fat"] as const) {
    if (Math.abs(mealSlots.reduce((sum, slot) => sum + slot.targetAllocation[key], 0) - 1) > 0.000001) throw new Error("各餐宏量份额之和必须为 100%。");
  }
  const rules = record(item.reviewRules);
  const version = boundedNumber(item.version, 1, 1000000, "协议版本");
  const minutes = boundedNumber(item.preTrainingNoIntakeMinutes, 0, 1440, "训练前间隔");
  if (!Number.isInteger(version) || !Number.isInteger(minutes)) throw new Error("版本与分钟须为整数。");
  if (typeof item.changeReason !== "string" || item.changeReason.length > 500 || (item.supersedesId !== null && (typeof item.supersedesId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.supersedesId)))) throw new Error("协议版本来源无效。");
  const reviewRules = {
    minWeightsPerWeek: boundedNumber(rules.minWeightsPerWeek, 1, 7, "晨重样本数"),
    minIntakeDaysPerWeek: boundedNumber(rules.minIntakeDaysPerWeek, 1, 7, "实际记录天数"),
    stableTargetDays: boundedNumber(rules.stableTargetDays, 14, 90, "目标稳定天数"),
    firstReviewDays: boundedNumber(rules.firstReviewDays, 14, 90, "首次复盘天数"),
  };
  if (Object.values(reviewRules).some((n) => !Number.isInteger(n))) throw new Error("复盘天数必须为整数。");
  let evidenceWindow: PlanProtocol["evidenceWindow"];
  if (item.evidenceWindow != null) {
    const evidence = record(item.evidenceWindow);
    if (!isDateKey(String(evidence.from)) || !isDateKey(String(evidence.to)) || String(evidence.from) > String(evidence.to)) throw new Error("复盘证据日期无效。");
    evidenceWindow = { from: String(evidence.from), to: String(evidence.to) };
  }
  return { ...item, id: item.id, schemaVersion: item.schemaVersion, ...(nutrition ? { nutrition, requestId: item.id } : {}), presetId: "eveningTreRptV4", version, effectiveFrom: String(item.effectiveFrom), timeZone: validZone(item.timeZone), targetMode: "calibrated", allocationMode: "explicitMacros", dailyTarget, eatingWindow: parseMealSchedule(item.eatingWindow), trainingStartLocal: validTime(item.trainingStartLocal), preTrainingNoIntakeMinutes: minutes, mealSlots, trainingCycle: { id: "rptAlternate8DayV4", anchorDate: String(cycle.anchorDate), phase: "recovery", lengthDays: 8 }, reviewRules, supersedesId: item.supersedesId as string | null, changeReason: item.changeReason, ...(evidenceWindow ? { evidenceWindow } : {}) };
}

export function resolveProtocol(protocols: PlanProtocol[], date: string): PlanProtocol | null {
  if (!isDateKey(date)) throw new Error("业务日期无效。");
  return [...protocols].filter((p) => p.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version)[0] ?? null;
}

export function calibratedTarget(profile: UserProfile): MacroTotals | null {
  if (profile.targetMode !== "calibrated") return null;
  if (!profile.protocolSnapshot) throw new Error("校准模式缺少执行协议，已停止计算。");
  return { ...profile.protocolSnapshot.dailyTarget };
}

export function protocolMeals(protocol: PlanProtocol): MealPlan[] {
  return protocol.mealSlots.map((slot) => ({ ...structuredClone(slot), ratio: targetForAllocation(protocol.dailyTarget, slot.targetAllocation).kcal / protocol.dailyTarget.kcal, locked: false, entries: [] }));
}

export function targetForAllocation(daily: MacroTotals, allocation: MacroRatio): MacroTotals {
  const protein = daily.protein * allocation.protein;
  const carbs = daily.carbs * allocation.carbs;
  const fat = daily.fat * allocation.fat;
  return { protein, carbs, fat, kcal: protein * 4 + carbs * 4 + fat * 9 };
}

export function assertMealAllocations(meals: Pick<MealPlan, "id" | "name" | "targetAllocation">[]): void {
  if (meals.length < 1 || meals.length > 12) throw new Error("每天可设置 1–12 餐。");
  if (new Set(meals.map(meal => meal.id)).size !== meals.length || meals.some(meal => !meal.id || !meal.name.trim() || meal.name.length > 80)) throw new Error("餐次标识不能重复，餐名须为 1–80 个字符。");
  for (const key of ["protein", "carbs", "fat"] as const) {
    if (meals.some(meal => { const value = meal.targetAllocation?.[key]; return value == null || !Number.isFinite(value) || value < 0 || value > 1; })) throw new Error("餐次缺少有效的宏量份额。");
    if (Math.abs(meals.reduce((sum, meal) => sum + meal.targetAllocation![key], 0) - 1) > 0.000001) throw new Error("各餐宏量份额之和必须为 100%。");
  }
}

export function explicitMealTargets(profile: UserProfile, meals: MealPlan[], dailyTarget?: MacroTotals): Map<string, MacroTotals> | null {
  if (profile.allocationMode !== "explicitMacros") return null;
  const target = calibratedTarget(profile) ?? dailyTarget;
  if (!target) throw new Error("显式分餐缺少固定目标。");
  assertMealAllocations(meals);
  return new Map(meals.map((meal) => {
    if (!meal.targetAllocation) throw new Error("餐次缺少显式宏量份额。");
    return [meal.id, targetForAllocation(target, meal.targetAllocation)];
  }));
}

export function planDocumentVersion(profile: UserProfile, meals: MealPlan[]): 2 | 3 {
  return profile.protocolSnapshot || meals.some((meal) => meal.kind || meal.schedule || meal.targetAllocation) ? 3 : 2;
}
