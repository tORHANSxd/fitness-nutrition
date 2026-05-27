import { beforeEach, describe, expect, it } from "vitest";
import { createStarterMeals, defaultProfile } from "@/lib/demoState";
import { builtinFoods } from "@/lib/foods";
import { calculateFoodKcalPer100g } from "@/lib/nutrition";
import {
  deleteFood,
  loadFoods,
  loadPlannerDraft,
  loadPlannerTemplates,
  saveFood,
  savePlannerDraft,
  savePlannerTemplates
} from "@/lib/storage";
import type { FoodItem } from "@/lib/types";

describe("food storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores public food edits as user overrides without duplicating the food", async () => {
    const rice = builtinFoods.find((food) => food.id === "public-rice-cooked");
    expect(rice).toBeDefined();

    const override = { ...rice!, carbsPer100g: 30, source: "public" as const };
    await saveFood(override, null);
    const foods = await loadFoods(null);
    const riceRows = foods.filter((food) => food.id === "public-rice-cooked");

    expect(riceRows).toHaveLength(1);
    expect(riceRows[0].kcalPer100g).toBe(calculateFoodKcalPer100g(override));
    expect(riceRows[0].source).toBe("public");
    expect(riceRows[0].isUserOverride).toBe(true);
  });

  it("resets a public override back to the built-in food", async () => {
    const rice = builtinFoods.find((food) => food.id === "public-rice-cooked");
    expect(rice).toBeDefined();

    await saveFood({ ...rice!, carbsPer100g: 30, source: "public" }, null);
    await deleteFood("public-rice-cooked", null);
    const foods = await loadFoods(null);
    const restoredRice = foods.find((food) => food.id === "public-rice-cooked");

    expect(restoredRice?.kcalPer100g).toBe(calculateFoodKcalPer100g(rice!));
    expect(restoredRice?.isUserOverride).toBeUndefined();
  });

  it("updates an existing custom food instead of adding a duplicate", async () => {
    const customFood: FoodItem = {
      id: "",
      name: "测试食物",
      category: "主食",
      kcalPer100g: 100,
      fatPer100g: 1,
      carbsPer100g: 20,
      proteinPer100g: 3,
      weightBasis: "cooked",
      cookedRawRatio: null,
      source: "user"
    };

    const savedFood = await saveFood(customFood, null);
    const updatedFood = { ...savedFood, carbsPer100g: 25 };
    await saveFood(updatedFood, null);
    const foods = await loadFoods(null);
    const customRows = foods.filter((food) => food.id === savedFood.id);

    expect(customRows).toHaveLength(1);
    expect(customRows[0].kcalPer100g).toBe(calculateFoodKcalPer100g(updatedFood));
  });

  it("stores planner drafts and templates under the local user bucket", () => {
    const meals = createStarterMeals(defaultProfile);
    const mealTemplate = {
      id: "meal-template",
      name: "午餐模板",
      sourceMealName: "午餐",
      mealRatio: meals[0].ratio,
      mealLocked: meals[0].locked,
      entries: meals[0].entries,
      createdAt: "2026-05-27T00:00:00.000Z"
    };
    const dayTemplate = {
      id: "day-template",
      name: "全天模板",
      meals,
      createdAt: "2026-05-27T00:00:00.000Z"
    };

    savePlannerDraft(defaultProfile, meals, null);
    savePlannerTemplates(null, {
      mealTemplates: [mealTemplate],
      dayTemplates: [dayTemplate]
    });

    expect(loadPlannerDraft(null)?.profile.weightKg).toBe(defaultProfile.weightKg);
    expect(loadPlannerTemplates(null).mealTemplates[0].entries[0].grams).toBe(meals[0].entries[0].grams);
    expect(loadPlannerTemplates(null).dayTemplates[0].meals).toHaveLength(meals.length);
  });
});
