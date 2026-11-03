import { describe, expect, it } from "vitest";
import { adjustDailyEnergy, dailyTargetForDate, parseDailyEnergyAdjustment } from "@/lib/nutritionStrategy";
import { buildNutritionResult, calculateDailyTarget, calculatePlannedCalorieDelta, getCalorieDeficit, targetTdee } from "@/lib/nutrition";
import { emptyProfile, defaultProfile } from "@/lib/demoState";
import { normalizeUserProfile, parseSavedPlanRow } from "@/lib/storageDocuments";
import { protocolMeals } from "@/lib/planProtocol";
import { normalizeActualV3, emptyActualV3 } from "@/lib/actualIntake";
import { syntheticGoalProtocol } from "../fixtures/nutritionGoalFixture";

describe("按日热量缺口", () => {
  const base = { kcal: 2250, protein: 170, fat: 55, carbs: 268.75 };
  it("800 kcal 得到1850 kcal，维持和非25整数缺口保留精度", () => {
    expect(adjustDailyEnergy(base, { tdeeKcal: 2650, deficitKcal: 800 })).toEqual({ kcal: 1850, protein: 170, fat: 55, carbs: 168.75 });
    expect(adjustDailyEnergy(base, { tdeeKcal: 2650, deficitKcal: 0 }).kcal).toBe(2650);
    expect(adjustDailyEnergy(base, { tdeeKcal: 2650, deficitKcal: 513 }).kcal).toBe(2137);
    expect(getCalorieDeficit({ calorieDeficit: 0 })).toBe(0);
  });
  it("拒绝非法输入及宏量超预算，不抬高热量", () => {
    for (const deficitKcal of [-1, NaN, Infinity, 2650]) expect(() => parseDailyEnergyAdjustment({ tdeeKcal: 2650, deficitKcal })).toThrow();
    expect(() => parseDailyEnergyAdjustment({ tdeeKcal: "2650", deficitKcal: 800 })).toThrow();
    expect(() => adjustDailyEnergy(base, { tdeeKcal: 2650, deficitKcal: 2000 })).toThrow("超过");
    expect(() => calculateDailyTarget({ ...defaultProfile, targetKcal: 1200, proteinTargetG: 300, fatTargetG: 150 })).toThrow("超过");
  });
  it("计划、实际和分餐保留同一目标，协议及别的日期不变", () => {
    const protocol = syntheticGoalProtocol();
    const original = structuredClone(protocol);
    const adjustment = { tdeeKcal: 2800, deficitKcal: 600 };
    const profile = { ...emptyProfile, planDate: "2026-01-02", targetMode: "calibrated" as const, allocationMode: "explicitMacros" as const, protocolSnapshot: protocol, dailyEnergyAdjustment: adjustment };
    const meals = protocolMeals(protocol, profile.planDate);
    const result = buildNutritionResult(profile, meals, []);
    expect(result.dailyTarget.kcal).toBe(2200);
    expect(result.plannedCalorieDelta).toBe(-600);
    expect(result.cycleAverageTarget).toEqual(protocol.dailyTarget);
    expect(result.mealRecommendations.reduce((sum, meal) => sum + meal.target.kcal, 0)).toBeCloseTo(2200);
    expect(normalizeUserProfile(profile).dailyEnergyAdjustment).toEqual(adjustment);
    expect(parseSavedPlanRow({ schema_version: 3, plan_date: profile.planDate, profile, meals, result }).result.dailyTarget).toEqual(result.dailyTarget);
    expect(normalizeActualV3({ ...emptyActualV3(), targetEnergyAdjustment: adjustment }).targetEnergyAdjustment).toEqual(adjustment);
    expect(dailyTargetForDate(protocol, "2026-01-03")).toEqual(original.dailyTarget);
    expect(protocol).toEqual(original);
  });
  it("计划缺口使用冻结消耗，未知消耗不被旧档案冒充", () => {
    const protocol = syntheticGoalProtocol();
    const profile = { ...defaultProfile, targetMode: "calibrated" as const, protocolSnapshot: protocol };
    expect(calculatePlannedCalorieDelta(profile)).toBeCloseTo(protocol.dailyTarget.kcal - protocol.nutrition!.result.expenditure.tdeeKcal!);
    protocol.nutrition!.result.expenditure.tdeeKcal = null;
    expect(targetTdee(profile)).toBeNull();
  });
});
