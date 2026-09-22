import { createNutritionPolicy } from "@/lib/nutritionGoals/presets";
import { createNutritionSnapshot } from "@/lib/nutritionGoals/snapshot";
import { createTreProtocol } from "@/lib/planPresets";
import type { CalculationBodySnapshot, GoalPresetId, NutritionPolicyV1 } from "@/lib/nutritionGoals/types";
import type { PlanProtocol } from "@/lib/types";

export const syntheticBody: CalculationBodySnapshot = { calculationDate: "2026-01-01", timeZone: "Asia/Shanghai", weightKg: 90, weightSource: "manual", weightDates: ["2026-01-01"], heightCm: 180, ageYears: 30, ageSource: "confirmed_years", calculationSex: "male", scope: { adultAttested: true }, recovery: "unknown" };
export function syntheticPolicy(presetId: GoalPresetId = "cut_recomp"): NutritionPolicyV1 {
  return { ...createNutritionPolicy(presetId), tdee: { kind: "pal_total", multiplier: 1.5, includesExercise: true } };
}
export function syntheticGoalProtocol(input: { id?: string; date?: string; previous?: PlanProtocol; policy?: NutritionPolicyV1 } = {}): PlanProtocol {
  const id = input.id ?? "20000000-0000-4000-8000-000000000051";
  return createTreProtocol({ id, effectiveFrom: input.date ?? "2026-01-01", cycleAnchorDate: "2026-01-01", timeZone: "Asia/Shanghai", previous: input.previous, nutrition: createNutritionSnapshot(input.policy ?? syntheticPolicy(), syntheticBody) });
}
