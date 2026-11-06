import { createNutritionPolicy } from "@/lib/nutritionGoals/presets";
import type { CalculationBodySnapshot, NutritionPolicyV1 } from "@/lib/nutritionGoals/types";
import { syntheticBody } from "./nutritionGoalFixture";

export const flexibleBody: CalculationBodySnapshot = { ...syntheticBody, ffmInput: "body_fat", bodyFatPct: 20, bodyFatWeightKg: 90, bodyFatMeasuredOn: "2026-01-01", bodyFatSource: "合成体测", recovery: "stable" };
export function flexiblePolicy(): NutritionPolicyV1 {
  return { ...createNutritionPolicy("custom"), policyVersion: "nutrition-goals-v5.1", rmr: { kind: "not_used" }, tdee: { kind: "not_used" }, energy: { kind: "fixed_kcal", kcal: 2200 },
    protein: { kind: "ffm", coefficient: 2.5 }, fat: { kind: "body_weight", coefficient: .6 }, carbs: { kind: "residual" } };
}
