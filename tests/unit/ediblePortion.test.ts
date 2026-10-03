import { describe, expect, it } from "vitest";
import { calculateMealTotals } from "@/lib/nutrition";
import { confirmMealEvent, actualEntryTotals } from "@/lib/actualIntake";
import { foodSnapshotFromFood, parseFoodSnapshot } from "@/lib/foodSnapshots";
import { parseMeals } from "@/lib/storageDocuments";
import {
  materializeTemplateEntries,
  templateRefsFromEntries,
  mealTemplateFromRow,
} from "@/lib/templates";
import type { FoodItem, MealFoodEntry, MealPlan } from "@/lib/types";

const food = {
  id: "test-food",
  name: "测试食物",
  category: "水果",
  carbsPer100g: 20,
  proteinPer100g: 10,
  fatPer100g: 5,
  kcalPer100g: 165,
  weightBasis: "none",
  source: "public",
  ediblePercent: 70,
} as FoodItem;
const foods = new Map([[food.id, food]]);
const entry = {
  id: "entry",
  foodId: food.id,
  grams: 200,
  locked: true,
  useEdiblePortion: true,
  ediblePercent: 70,
} as MealFoodEntry;
const meal: MealPlan = {
  id: "meal",
  name: "早餐",
  ratio: 1,
  locked: false,
  entries: [entry],
};

describe("可食部的计算与保存", () => {
  it("200g 带皮称重按 70% 可食部计算为 140g，只扣除一次", () => {
    expect(calculateMealTotals(meal, foods)).toMatchObject({
      carbs: 28,
      protein: 14,
      fat: 7,
    });
    expect(calculateMealTotals(meal, foods).kcal).toBeCloseTo(231, 8);
    const event = confirmMealEvent(meal, foods, {
      id: "event",
      timeZone: "Asia/Shanghai",
    });
    expect(event.actualFoodEntries[0].grams).toBe(140);
    expect(actualEntryTotals(event.actualFoodEntries[0]).kcal).toBeCloseTo(231);
  });
  it("未勾选或旧条目始终把输入重量当作可食重量", () => {
    const old = { id: "old", foodId: food.id, grams: 200, locked: false };
    expect(calculateMealTotals({ ...meal, entries: [old] }, foods).kcal).toBe(
      330,
    );
    expect(
      calculateMealTotals(
        {
          ...meal,
          entries: [{ ...entry, useEdiblePortion: false } as MealFoodEntry],
        },
        foods,
      ).kcal,
    ).toBe(330);
  });
  it("100% 与零克重计算正常", () => {
    expect(
      calculateMealTotals(
        {
          ...meal,
          entries: [{ ...entry, ediblePercent: 100 } as MealFoodEntry],
        },
        foods,
      ).kcal,
    ).toBe(330);
    expect(
      calculateMealTotals({ ...meal, entries: [{ ...entry, grams: 0 }] }, foods)
        .kcal,
    ).toBe(0);
  });
  it("快照、计划与模板恢复可食部选择及当时比例", () => {
    expect(parseFoodSnapshot(foodSnapshotFromFood(food))).toMatchObject({
      ediblePercent: 70,
    });
    expect(
      parseMeals(JSON.parse(JSON.stringify([meal])))[0].entries[0],
    ).toMatchObject({ useEdiblePortion: true, ediblePercent: 70 });
    const refs = templateRefsFromEntries(meal.entries, foods);
    const saved = mealTemplateFromRow({
      id: "template",
      name: "早餐",
      payload: { version: 3, foods: refs },
    });
    const changedFood = { ...food, ediblePercent: 40 } as FoodItem;
    expect(
      materializeTemplateEntries(
        saved!.foods,
        new Map([[food.id, changedFood]]),
      )[0],
    ).toMatchObject({ useEdiblePortion: true, ediblePercent: 70 });
  });
  it.each([0, -1, 101, null, "70"])(
    "拒绝启用换算但比例无效的持久数据：%s",
    (percent) => {
      expect(() =>
        parseMeals([
          { ...meal, entries: [{ ...entry, ediblePercent: percent }] },
        ]),
      ).toThrow();
    },
  );
});
