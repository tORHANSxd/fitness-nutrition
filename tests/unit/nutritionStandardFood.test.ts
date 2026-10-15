import { describe, expect, it } from "vitest";
import { calculateFoodTotals, calculateMealTotals, buildNutritionResult } from "@/lib/nutrition";
import { actualEntryTotals, actualCoverageKnown, confirmMealEvent } from "@/lib/actualIntake";
import { attachFoodSnapshots, foodSnapshotFromFood, parseFoodSnapshot } from "@/lib/foodSnapshots";
import { fromInputWeight } from "@/lib/foodWeights";
import { jsonToFoodForms, csvToFoodForms, foodsToCsv } from "@/lib/dataIO";
import { defaultProfile } from "@/lib/demoState";
import type { FoodItem, MealPlan } from "@/lib/types";

const food = { id: "reference", name: "合成标签样品", category: "肉类", kcalPer100g: 150, sourceKcalPer100g: 150, sourceEnergyMethod: "product_label", sourceQuality: "verified_label", effectiveEnergyBasis: "label", carbohydrateBasis: "available_excluding_fiber", sourceCarbsPer100g: 10, fiberPer100g: null, proteinPer100g: 20, carbsPer100g: 10, fatPer100g: 2, weightBasis: "raw", cookedRawRatio: 0.75, source: "user" } as const;
const meal: MealPlan = { id: "meal", name: "午餐", ratio: 1, locked: false, entries: [{ id: "entry", foodId: food.id, grams: 100, locked: false }] };

describe("营养标准：食物数据与历史兼容", () => {
  it("来源150kcal与4/4/9的138kcal分别保留，计划与确认实际一致", () => {
    expect(calculateFoodTotals(food, 100).kcal).toBe(150);
    const frozen = foodSnapshotFromFood(food);
    expect(frozen).toMatchObject({ version: 2, sourceKcalPer100g: 150, macroKcalPer100g: 138, fiberPer100g: null });
    const event = confirmMealEvent(meal, new Map([[food.id, food]]), { id: "actual", timeZone: "Asia/Shanghai" });
    expect(actualEntryTotals(event.actualFoodEntries[0])).toEqual(calculateFoodTotals(food, 100));
  });

  it("旧V1历史采用原宏量策略，并且再次保存不被新食物库覆盖", () => {
    const old = { version: 1, name: food.name, category: food.category, kcalPer100g: 150, proteinPer100g: 20, carbsPer100g: 10, fatPer100g: 2, weightBasis: food.weightBasis, cookedRawRatio: 0.75 } as const;
    const historical = { ...meal, entries: [{ ...meal.entries[0], foodSnapshot: old }] };
    const changed = { ...food, sourceKcalPer100g: 700, kcalPer100g: 700, proteinPer100g: 99 };
    expect(calculateMealTotals(historical, new Map([[food.id, changed]])).kcal).toBe(138);
    expect(attachFoodSnapshots([historical], new Map([[food.id, changed]]))[0].entries[0].foodSnapshot).toEqual(old);
  });

  it("可食部只扣一次，来源能量与跨生熟输入一致", () => {
    const selected = { ...meal.entries[0], inputWeightBasis: "cooked" as const, useEdiblePortion: true, ediblePercent: 50 };
    const grams = fromInputWeight(food, 75, selected);
    expect(grams).toBe(100);
    const event = confirmMealEvent({ ...meal, entries: [{ ...selected, grams }] }, new Map([[food.id, food]]), { id: "actual", timeZone: "Asia/Shanghai" });
    expect(actualEntryTotals(event.actualFoodEntries[0]).kcal).toBe(75);
  });

  it("没有出成率时拒绝把生重直接当成熟重营养的克重", () => {
    expect(() => fromInputWeight({ ...food, weightBasis: "cooked", cookedRawRatio: null }, 170, { inputWeightBasis: "raw" })).toThrow(/WEIGHT_BASIS_MISMATCH/);
  });

  it("导入缺失或非法营养值明确报错，真实0和未知纤维可往返", () => {
    expect(jsonToFoodForms(JSON.stringify([{ name: "缺失样品", weightBasis: "raw" }]))).toMatchObject({ foods: [], skipped: 1 });
    expect(jsonToFoodForms(JSON.stringify([{ name: "缺失样品", weightBasis: "raw" }])).errors[0].message).toMatch(/MISSING_NUTRIENT_DATA/);
    for (const value of [null, false, -1, "Infinity", "unknown"])
      expect(jsonToFoodForms(JSON.stringify([{ ...food, proteinPer100g: value }])).foods).toHaveLength(0);
    const imported = csvToFoodForms(foodsToCsv([{ ...food, proteinPer100g: 0 }]));
    expect(imported.foods[0]).toMatchObject({ proteinPer100g: 0, sourceKcalPer100g: 150, fiberPer100g: null });
    expect(parseFoodSnapshot({ ...foodSnapshotFromFood(food), fiberPer100g: -1 })).toBeNull();
    expect(jsonToFoodForms(JSON.stringify([{ ...food, kcalPer100g: 149 }])).errors[0].message).toContain("来源热量与食品能量不一致");
  });

  it("只有计划或来源不明的V2汇总不具备真实摄入校准资格", () => {
    expect(actualCoverageKnown({ version: 2, foods: [{ foodId: "food", name: "样品", grams: 100, totals: { kcal: 150, protein: 20, carbs: 10, fat: 2 } }], exercises: [], bmrKcal: 0, activityKcal: 0 })).toBe(false);
  });

  it("补剂即使未手动锁定也不参与自动调整剂量", () => {
    const supplement: FoodItem = { ...food, category: "补剂", sourceKcalPer100g: 400, kcalPer100g: 400 };
    const result = buildNutritionResult({ ...defaultProfile, targetKcal: 2000, proteinTargetG: 180, fatTargetG: 65 }, [{ ...meal, entries: [{ ...meal.entries[0], grams: 5 }] }], [supplement]);
    expect(result.mealRecommendations[0].recommendedEntries.entry).toBe(5);
  });
});
