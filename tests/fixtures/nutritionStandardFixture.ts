import { createNutritionPolicy } from "@/lib/nutritionGoals/presets";
import { targetFromKcal } from "@/lib/planProtocol";

// Synthetic proposal; no body measurements, account identity or real records.
export const syntheticStandard = {
  documentType: "personal_nutrition_standard", documentVersion: "1.0.0", status: "proposal_not_activated", defaultMode: "fixed_daily",
  dailyTarget: targetFromKcal(2200, 180, 65),
  enginePolicy: { ...createNutritionPolicy("custom"), originPreset: "cut_recomp", rmr: { kind: "not_used" }, tdee: { kind: "not_used" }, energy: { kind: "fixed_kcal", kcal: 2200 }, protein: { kind: "fixed_grams", grams: 180 }, fat: { kind: "fixed_grams", grams: 65 }, carbs: { kind: "residual" } },
  mealSlotsProposal: [
    { id: "lunch", name: "午餐", kind: "main", schedule: { start: "11:30", end: "12:00", endDayOffset: 0 }, targetAllocation: { protein: 70 / 180, carbs: 90 / 223.75, fat: 25 / 65 } },
    { id: "afternoon-snack", name: "下午加餐", kind: "snack", schedule: { start: "16:00", end: "16:30", endDayOffset: 0 }, targetAllocation: { protein: 40 / 180, carbs: 43.75 / 223.75, fat: 10 / 65 } },
    { id: "dinner", name: "晚餐", kind: "main", schedule: { start: "20:00", end: "20:30", endDayOffset: 0 }, targetAllocation: { protein: 70 / 180, carbs: 90 / 223.75, fat: 30 / 65 } },
  ],
  preTrainingNoIntakeMinutesProposal: 0,
  foodPattern: { vegetableGramsRawEdible: [500, 600], fruitGramsEdible: [200, 350], fiberGrams: [25, 35] },
  optionalCarbCycle: { enabled: false, cycleLengthDays: 7, startAfterStableLoggingDays: 14, isoWeekdaysTraining: [1, 2, 4, 6], trainingTarget: targetFromKcal(2275, 180, 65), restTarget: targetFromKcal(2100, 180, 65), weeklyTargetKcal: 15400 },
};
