import { describe, expect, it } from "vitest";
import { attachFoodSnapshots, foodSnapshotFromFood, resolveMealFood, unresolvedFoodFlags } from "@/lib/foodSnapshots";
import type { FoodItem, MealFoodEntry, MealPlan } from "@/lib/types";

const food: FoodItem = {
  id: "food-1",
  name: "原始食物",
  category: "主食",
  kcalPer100g: 100,
  carbsPer100g: 20,
  proteinPer100g: 3,
  fatPer100g: 1,
  weightBasis: "raw",
  source: "user"
};
const entry: MealFoodEntry = { id: "entry-1", foodId: food.id, grams: 100, locked: false };

describe("food snapshot resolution", () => {
  it("prefers live food for editable plans and falls back to a valid snapshot", () => {
    const snapshotEntry = { ...entry, foodSnapshot: foodSnapshotFromFood({ ...food, name: "保存时名称" }) };
    expect(resolveMealFood(snapshotEntry, new Map([[food.id, food]]))).toMatchObject({ status: "live", food: { name: "原始食物" } });
    expect(resolveMealFood(snapshotEntry, new Map())).toMatchObject({ status: "snapshot", food: { name: "保存时名称" } });
  });

  it("keeps unresolved references visible and marks their plan integrity", () => {
    const missing = { ...entry, foodId: "missing-food" };
    const meals: MealPlan[] = [{ id: "meal", name: "早餐", ratio: 1, locked: false, entries: [missing] }];
    expect(resolveMealFood(missing, new Map())).toEqual({ status: "unresolved", food: null });
    expect(unresolvedFoodFlags(meals, new Map())).toEqual(["unresolved_food_ref:missing-food"]);
  });

  it("attaches snapshots before persistence", () => {
    const meals: MealPlan[] = [{ id: "meal", name: "早餐", ratio: 1, locked: false, entries: [entry] }];
    const attached = attachFoodSnapshots(meals, new Map([[food.id, food]]));
    expect(attached[0].entries[0].foodSnapshot).toEqual(foodSnapshotFromFood(food));
  });
});
