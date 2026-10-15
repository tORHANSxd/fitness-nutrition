"use client";
import type { User } from "@supabase/supabase-js";
import { assertDocument, assertMealAllocations, parseAllocation, parseMealSchedule, record, targetFromKcal } from "@/lib/planProtocol";
import { parseNutritionStrategy, type NutritionStrategy } from "@/lib/nutritionStrategy";
import { getSupabaseClient } from "@/lib/supabase";
import type { NutritionPolicyV1 } from "@/lib/nutritionGoals/types";
import type { PlanProtocol } from "@/lib/types";

export interface NutritionStandardProposal {
  policy: NutritionPolicyV1;
  meals: PlanProtocol["mealSlots"];
  optionalCycle: NutritionStrategy;
  preTrainingNoIntakeMinutes: number;
  foodPattern: { vegetable: number[]; fruit: number[]; fiber: number[] };
}

export function parseNutritionStandard(value: unknown): NutritionStandardProposal {
  assertDocument(value, 65536);
  const doc = record(value), policy = record(doc.enginePolicy) as unknown as NutritionPolicyV1;
  if (doc.documentType !== "personal_nutrition_standard" || doc.documentVersion !== "1.0.0" || doc.defaultMode !== "fixed_daily"
    || policy.schemaVersion !== 1 || policy.policyVersion !== "nutrition-goals-v5.0" || policy.presetId !== "custom" || policy.presetVersion !== 1
    || policy.energy?.kind !== "fixed_kcal" || policy.protein?.kind !== "fixed_grams" || policy.fat?.kind !== "fixed_grams" || policy.carbs?.kind !== "residual"
    || policy.refreshMode !== "preview_then_confirm") throw new Error("个人标准格式或策略版本无效；请使用目标标准文件。");
  const daily = targetFromKcal(policy.energy.kcal!, policy.protein.grams!, policy.fat.grams!);
  const declared = record(doc.dailyTarget);
  if (Object.entries(daily).some(([k, n]) => typeof declared[k] !== "number" || Math.abs(n - (declared[k] as number)) > 1e-6)) throw new Error("个人标准目标与策略不一致。");
  if (!Array.isArray(doc.mealSlotsProposal)) throw new Error("个人标准餐次无效。");
  const meals: PlanProtocol["mealSlots"] = doc.mealSlotsProposal.map(raw => {
    const m = record(raw);
    if (typeof m.id !== "string" || typeof m.name !== "string" || (m.kind !== "main" && m.kind !== "snack")) throw new Error("个人标准餐次字段无效。");
    return { id: m.id, name: m.name, kind: m.kind, schedule: parseMealSchedule(m.schedule), targetAllocation: parseAllocation(m.targetAllocation) };
  });
  assertMealAllocations(meals);
  const cycle = record(doc.optionalCarbCycle);
  if (cycle.enabled !== false || cycle.cycleLengthDays !== 7) throw new Error("导入草案必须默认关闭周期，启用需要重新预览确认。");
  const optionalCycle = parseNutritionStrategy({ version: 1, mode: "weekly_cycle", isoWeekdaysTraining: cycle.isoWeekdaysTraining, trainingTarget: cycle.trainingTarget, restTarget: cycle.restTarget, weeklyTargetKcal: cycle.weeklyTargetKcal, startAfterStableLoggingDays: cycle.startAfterStableLoggingDays }, daily);
  const pattern = record(doc.foodPattern);
  const range = (v: unknown): number[] => { if (!Array.isArray(v) || v.length !== 2 || v.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0) || v[0] > v[1]) throw new Error("食物参考范围无效。"); return [...v]; };
  if (doc.preTrainingNoIntakeMinutesProposal !== 0) throw new Error("此标准版本不支持额外禁食间隔。");
  return { policy: structuredClone(policy), meals, optionalCycle, preTrainingNoIntakeMinutes: 0, foodPattern: { vegetable: range(pattern.vegetableGramsRawEdible), fruit: range(pattern.fruitGramsEdible), fiber: range(pattern.fiberGrams) } };
}

export async function loadNutritionStandard(user: User): Promise<NutritionStandardProposal | null> {
  const client = getSupabaseClient(); if (!client) throw new Error("数据库尚未连接。");
  const { data, error } = await client.from("nutrition_standard_proposals").select("payload").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data ? parseNutritionStandard(data.payload) : null;
}

export async function saveNutritionStandard(value: unknown, user: User): Promise<NutritionStandardProposal> {
  const parsed = parseNutritionStandard(value), client = getSupabaseClient(); if (!client) throw new Error("数据库尚未连接。");
  const { error } = await client.from("nutrition_standard_proposals").upsert({ user_id: user.id, payload: value }, { onConflict: "user_id" });
  if (error) throw error;
  return parsed;
}
