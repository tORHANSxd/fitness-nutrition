import { describe, expect, it } from "vitest";
import { createStarterMeals, defaultProfile } from "@/lib/demoState";
import { builtinFoods } from "@/lib/foods";
import { buildNutritionResult } from "@/lib/nutrition";
import {
  StorageAuthError,
  deleteFood,
  deletePlan,
  loadFoods,
  loadPlannerDraft,
  loadPlannerTemplates,
  loadPlans,
  saveFood,
  savePlan,
  savePlannerDraft,
  savePlannerTemplates
} from "@/lib/storage";
import type { FoodItem, PlannerTemplates } from "@/lib/types";

// 改造后：全站业务数据一律只落 Supabase 云端，未登录（user=null）时所有存取都必须
// 抛 StorageAuthError，绝不再读写客户端本地 localStorage。这组用例即守住该不变量。
describe("storage requires Supabase auth (no local fallback)", () => {
  const meals = createStarterMeals(defaultProfile);
  const result = buildNutritionResult(defaultProfile, meals, builtinFoods);
  const sampleFood: FoodItem = {
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
  const templates: PlannerTemplates = { mealTemplates: [], dayTemplates: [] };

  it("rejects every read/write when unauthenticated", async () => {
    await expect(loadFoods(null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(saveFood(sampleFood, null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(deleteFood("public-rice-cooked", null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(savePlan(defaultProfile, meals, result, null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(loadPlans(null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(deletePlan("any-id", null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(loadPlannerDraft(null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(savePlannerDraft(defaultProfile, meals, null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(loadPlannerTemplates(null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(savePlannerTemplates(null, templates)).rejects.toBeInstanceOf(StorageAuthError);
  });

  it("never touches localStorage on a failed unauthenticated write", async () => {
    window.localStorage.clear();
    await expect(savePlannerDraft(defaultProfile, meals, null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(saveFood(sampleFood, null)).rejects.toBeInstanceOf(StorageAuthError);
    await expect(savePlannerTemplates(null, templates)).rejects.toBeInstanceOf(StorageAuthError);
    expect(window.localStorage.length).toBe(0);
  });
});
