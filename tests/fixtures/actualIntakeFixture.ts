import { emptyActualV3 } from "@/lib/actualIntake";
import type { DailyCheckinActualV3, MacroTotals } from "@/lib/types";

export function confirmedSyntheticActual(target: MacroTotals): DailyCheckinActualV3 {
  return { ...emptyActualV3(), intakeComplete: true, mealEvents: [{ id: "synthetic-event", timeZone: "Asia/Shanghai", entryMethod: "measured", containsCalories: true,
    actualFoodEntries: [{ id: "synthetic-actual-food", foodId: "synthetic-food", grams: 100, energyBasis: "label", foodSnapshot: { version: 1, name: "合成食品", category: "其他", weightBasis: "none", cookedRawRatio: null, kcalPer100g: target.kcal, proteinPer100g: target.protein, carbsPer100g: target.carbs, fatPer100g: target.fat } }] }] };
}
