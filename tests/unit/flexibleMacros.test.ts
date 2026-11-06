import { describe, expect, it } from "vitest";
import { resolveFlexibleMacros } from "@/lib/nutritionGoals/flexibleMacros";
import { calculateNutritionTarget } from "@/lib/nutritionGoals/calculator";
import { createNutritionSnapshot, parseNutritionSnapshot } from "@/lib/nutritionGoals/snapshot";
import { adjustDailyEnergy, parseDailyEnergyAdjustment } from "@/lib/nutritionStrategy";
import { flexibleBody, flexiblePolicy } from "../fixtures/flexibleNutritionFixture";
import type { MacroMethods } from "@/lib/nutritionGoals/types";
import { mergeLatestBodyMetrics } from "@/lib/bodyLogs";
import { emptyProfile } from "@/lib/demoState";
import { calculateDailyTarget, targetTdee } from "@/lib/nutrition";
import { syntheticGoalProtocol } from "../fixtures/nutritionGoalFixture";

const grams = (grams: number) => ({ kind: "fixed_grams" as const, grams });
const base = { kcal: 2200, protein: 180, fat: 60, carbs: 235 };

describe("精确营养素规则", () => {
  it.each([
    [{ protein: grams(180), fat: grams(60), carbs: { kind: "residual" } }, "carbs", 235],
    [{ protein: { kind: "residual" }, fat: grams(60), carbs: grams(250) }, "protein", 165],
    [{ protein: grams(180), fat: { kind: "residual" }, carbs: grams(250) }, "fat", 480 / 9],
  ] as const)("三种剩余项使用各自能量因子", (methods, key, expected) => {
    const target = resolveFlexibleMacros(2200, methods, {});
    expect(target[key]).toBeCloseTo(expected, 9);
    expect(target.protein * 4 + target.fat * 9 + target.carbs * 4).toBeCloseTo(2200, 9);
  });
  it("三项明确指定时验证能量守恒，零值和小数保留", () => {
    expect(resolveFlexibleMacros(2200, { protein: grams(170), fat: grams(60), carbs: grams(245) }, {})).toEqual({ kcal: 2200, protein: 170, fat: 60, carbs: 245 });
    expect(resolveFlexibleMacros(400, { protein: grams(0), fat: grams(0), carbs: { kind: "residual" } }, {}).carbs).toBe(100);
    expect(resolveFlexibleMacros(400, { protein: grams(100), fat: grams(0), carbs: { kind: "residual" } }, {}).carbs).toBe(0);
    expect(() => resolveFlexibleMacros(2201, { protein: grams(170), fat: grams(60), carbs: grams(245) }, {})).toThrow("不一致");
  });
  it("拒绝多个剩余、超预算、缺体重/体脂、字符串和非有限系数", () => {
    const valid: MacroMethods = { protein: grams(180), fat: grams(60), carbs: { kind: "residual" } };
    expect(() => resolveFlexibleMacros(2200, { ...valid, protein: { kind: "residual" } }, {})).toThrow("最多");
    expect(() => resolveFlexibleMacros(1000, valid, {})).toThrow("超过");
    for (const kind of ["body_weight", "ffm"] as const) expect(() => resolveFlexibleMacros(2200, { ...valid, protein: { kind, coefficient: 2 } }, {})).toThrow();
    for (const coefficient of [-1, Infinity, NaN, "2", null]) expect(() => resolveFlexibleMacros(2200, { ...valid, protein: { kind: "body_weight", coefficient } } as MacroMethods, { weightKg: 90 })).toThrow();
  });
  it("新版本混用全体重/去脂体重，精确513缺口；旧版本结果仍保持", () => {
    const policy = flexiblePolicy();
    expect(calculateNutritionTarget(policy, flexibleBody).resolvedTarget).toEqual({ kcal: 2200, protein: 180, fat: 54, carbs: 248.5 });
    policy.energy = { kind: "delta_kcal", deltaKcal: -513 };
    policy.tdee = { kind: "manual", kcal: 2650, source: "user_estimate" };
    const result = calculateNutritionTarget(policy, flexibleBody);
    expect(result.status).toBe("valid");
    expect(result.resolvedTarget).toEqual({ kcal: 2137, protein: 180, fat: 54, carbs: 232.75 });
    const legacy = { ...policy, policyVersion: "nutrition-goals-v5.0" as const, protein: { kind: "ffm" as const, coefficient: 2.5, contextConfirmed: true }, fat: { kind: "body_weight" as const, coefficient: .6, minimumEnergyShare: .2 } };
    expect(calculateNutritionTarget(legacy, flexibleBody).resolvedTarget).toEqual({ kcal: 2125, protein: 180, fat: 55, carbs: 227.5 });
  });
  it("仅碳水或脂肪使用FFM也检查来源，新快照保留完整计算证据", () => {
    const policy = { ...flexiblePolicy(), protein: { kind: "residual" as const }, fat: { kind: "ffm" as const, coefficient: .75 }, carbs: { kind: "body_weight" as const, coefficient: 3 } };
    const snapshot = createNutritionSnapshot(policy, flexibleBody);
    expect(snapshot.result.resolvedTarget).toEqual({ kcal: 2200, protein: 158.5, fat: 54, carbs: 270 });
    expect(parseNutritionSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    const wrongVersion = structuredClone(snapshot); wrongVersion.result.algorithmVersion = "nutrition-v5.0";
    expect(() => parseNutritionSnapshot(wrongVersion)).toThrow();
    const tampered = structuredClone(snapshot); tampered.result.trace.at(-1)!.resolvedValue++;
    expect(() => parseNutritionSnapshot(tampered)).toThrow();
    expect(calculateNutritionTarget(policy, { ...flexibleBody, bodyFatPct: null }).status).toBe("needs_input");
  });
  it("当天独立身体输入可往返，旧两字段调整沿用原蛋白/脂肪", () => {
    const adjustment = { tdeeKcal: 2650, deficitKcal: 450, macroInputs: { version: 1 as const, weightKg: 90, bodyFatPct: 20, protein: { kind: "ffm" as const, coefficient: 2.5 }, fat: { kind: "body_weight" as const, coefficient: .6 }, carbs: { kind: "residual" as const } } };
    expect(parseDailyEnergyAdjustment(JSON.parse(JSON.stringify(adjustment)))).toEqual(adjustment);
    expect(adjustDailyEnergy(base, adjustment)).toEqual({ kcal: 2200, protein: 180, fat: 54, carbs: 248.5 });
    expect(adjustDailyEnergy(base, { tdeeKcal: 2650, deficitKcal: 450 })).toEqual(base);
    for (const bodyFatPct of [undefined, null, "20", 100, -1]) expect(() => parseDailyEnergyAdjustment({ ...adjustment, macroInputs: { ...adjustment.macroInputs, bodyFatPct } })).toThrow();
    expect(() => parseDailyEnergyAdjustment({ ...adjustment, macroInputs: { ...adjustment.macroInputs, version: 2 } })).toThrow();
  });

  it("固定摄入与直接去脂体重不伪造消耗，新体测不改变冻结的当天计算", () => {
    const adjustment = { targetKcal: 2200, macroInputs: { version: 1 as const, weightKg: 90, bodyFatPct: null, ffmInput: "direct" as const, ffmKg: 72, protein: { kind: "ffm" as const, coefficient: 2.5 }, fat: grams(60), carbs: { kind: "residual" as const } } };
    expect(parseDailyEnergyAdjustment(adjustment)).toEqual(adjustment);
    expect(adjustDailyEnergy(base, adjustment)).toEqual(base);
    const policy = flexiblePolicy(); policy.protein = grams(180); policy.fat = grams(60);
    const profile = { ...emptyProfile, planDate: "2026-01-02", weightKg: 90, targetMode: "calibrated" as const, protocolSnapshot: syntheticGoalProtocol({ policy }), dailyEnergyAdjustment: adjustment };
    const merged = mergeLatestBodyMetrics(profile, [{ logDate: "2026-02-01", weightKg: 80, bodyFatPct: 30 }]);
    expect(merged.weightKg).toBe(80);
    expect(calculateDailyTarget(merged)).toEqual(base);
    expect(targetTdee(merged)).toBeNull();
    expect(() => parseDailyEnergyAdjustment({ ...adjustment, tdeeKcal: 2650, deficitKcal: 450 })).toThrow("不能同时");
    expect(() => parseDailyEnergyAdjustment({ ...adjustment, macroInputs: { ...adjustment.macroInputs, ffmKg: 91 } })).toThrow();
  });
});
