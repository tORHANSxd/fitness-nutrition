import { describe, expect, it } from "vitest";
import { createTreProtocol } from "@/lib/planPresets";
import { parsePlanProtocol, targetFromKcal } from "@/lib/planProtocol";
import { dailyTargetForDate, parseNutritionStrategy, type NutritionStrategy } from "@/lib/nutritionStrategy";
import { createNutritionPolicy } from "@/lib/nutritionGoals/presets";
import { createNutritionSnapshot } from "@/lib/nutritionGoals/snapshot";
import { emptyProfile } from "@/lib/demoState";
import { buildNutritionResult, calculateCycleAverageTarget } from "@/lib/nutrition";
import { cycleDay } from "@/lib/trainingCycle";

const target = targetFromKcal(2200, 180, 65);
const strategy: NutritionStrategy = { version: 1, mode: "weekly_cycle", isoWeekdaysTraining: [1, 2, 4, 6], trainingTarget: targetFromKcal(2275, 180, 65), restTarget: targetFromKcal(2100, 180, 65), weeklyTargetKcal: 15400, startAfterStableLoggingDays: 14 };
const nutrition = createNutritionSnapshot({ ...createNutritionPolicy("custom"), rmr: { kind: "not_used" }, tdee: { kind: "not_used" }, energy: { kind: "fixed_kcal", kcal: 2200 }, protein: { kind: "fixed_grams", grams: 180 }, fat: { kind: "fixed_grams", grams: 65 }, carbs: { kind: "residual" } }, { calculationDate: "2030-01-01", timeZone: "Asia/Shanghai", weightKg: null, weightSource: "manual", heightCm: null, ageYears: null, ageSource: "confirmed_years", calculationSex: null, scope: { adultAttested: true }, recovery: "stable" });

describe("日期营养目标与独立训练周期", () => {
  it("固定日与训练/休息日残差宏量、周预算可复现", () => {
    expect(target.carbs).toBe(223.75);
    expect(strategy.trainingTarget.carbs).toBe(242.5);
    expect(strategy.restTarget.carbs).toBe(198.75);
    expect(parseNutritionStrategy(strategy, target)).toEqual(strategy);
    expect(() => parseNutritionStrategy({ ...strategy, isoWeekdaysTraining: [1, 2, 4] }, target)).toThrow("周预算");
    expect(() => parseNutritionStrategy({ ...strategy, restTarget: { ...strategy.restTarget, carbs: 0 } }, target)).toThrow();
  });
  it("新协议按业务日期分餐，训练排期与7天预算一致，平均目标不漂移", () => {
    const protocol = createTreProtocol({ id: "11111111-1111-4111-8111-111111111111", effectiveFrom: "2030-01-01", cycleAnchorDate: "2030-01-01", timeZone: "Asia/Shanghai", nutrition, nutritionStrategy: structuredClone(strategy) });
    const profile = { ...emptyProfile, planDate: "2030-01-02", targetMode: "calibrated" as const, allocationMode: "explicitMacros" as const, protocolSnapshot: protocol };
    expect(protocol.schemaVersion).toBe(3);
    expect(dailyTargetForDate(protocol, "2030-01-01")).toEqual(strategy.trainingTarget);
    expect(dailyTargetForDate(protocol, "2030-01-02")).toEqual(strategy.restTarget);
    const meals = protocol.mealSlots.map(slot => ({ ...slot, ratio: 1 / 3, locked: false, entries: [] }));
    const result = buildNutritionResult(profile, meals, []);
    expect(result.dailyTarget.kcal).toBe(2100);
    expect(result.mealRecommendations.reduce((s, m) => s + m.target.kcal, 0)).toBeCloseTo(2100);
    expect(calculateCycleAverageTarget(profile)).toEqual(target);
    expect(cycleDay(protocol, "2030-01-02")?.prescription).toBeNull();
    expect(cycleDay(protocol, "2030-01-03")?.prescription).not.toBeNull();
  });
  it("旧协议不能用字段打开新策略，原8天循环语义保留", () => {
    const old = createTreProtocol({ id: "22222222-2222-4222-8222-222222222222", effectiveFrom: "2030-01-01", cycleAnchorDate: "2030-01-01", timeZone: "Asia/Shanghai", nutrition });
    expect(old.schemaVersion).toBe(2);
    expect(() => parsePlanProtocol({ ...old, nutritionStrategy: strategy })).toThrow();
    expect(dailyTargetForDate(old, "2030-01-02")).toEqual(target);
    expect(cycleDay(old, "2030-01-02")?.prescription).toBeNull();
  });
});
