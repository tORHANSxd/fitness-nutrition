import { builtinFoods } from "@/lib/foods";
import { createDefaultMeals } from "@/lib/nutrition";
import type { MealPlan, UserProfile } from "@/lib/types";

// v2 计划（2026-07-10）默认档案：2002 年男性，174cm / 93.2kg（2026-07-04 体测）。
// activityFactor 1.1 + 运动 800 → TDEE≈2895，落在文档估算区间 2850–2950；
// 目标固定 2300 kcal（缺省 targetKcal），对应赤字约 595——文档"每周 −0.5~0.7kg"。
export const defaultProfile: UserProfile = {
  sex: "male",
  age: 24,
  heightCm: 174,
  weightKg: 93.2,
  activityFactor: 1.1,
  exerciseKcal: 800,
  goalType: "cut",
  trainingTime: "afternoon",
  planDate: new Date().toISOString().slice(0, 10)
};

// v2 每日固定目标 2300 kcal / 碳水约 260g。把碳水分摊到 4 餐并保留高密度碳水（燕麦 66%），
// 让任何单餐都不必逼近 ~950g 的克数上限，求解器即可把全天推荐稳定落进硬性容忍带。
export function createStarterMeals(profile: UserProfile): MealPlan[] {
  const meals = createDefaultMeals(profile);
  return meals.map((meal) => {
    if (meal.id === "breakfast") {
      return {
        ...meal,
        entries: [
          { id: crypto.randomUUID(), foodId: "public-oats-raw", grams: 80, locked: false, minGrams: 0, maxGrams: 160 },
          { id: crypto.randomUUID(), foodId: "public-whey", grams: 30, locked: false, minGrams: 0, maxGrams: 45 },
          { id: crypto.randomUUID(), foodId: "public-banana-raw", grams: 120, locked: false, minGrams: 0, maxGrams: 250 }
        ]
      };
    }
    if (meal.id === "lunch") {
      return {
        ...meal,
        entries: [
          { id: crypto.randomUUID(), foodId: "public-rice-cooked", grams: 250, locked: false, minGrams: 0, maxGrams: 800 },
          { id: crypto.randomUUID(), foodId: "public-chicken-breast-cooked", grams: 170, locked: false, minGrams: 0, maxGrams: 300 },
          { id: crypto.randomUUID(), foodId: "public-broccoli-cooked", grams: 180, locked: false, minGrams: 0, maxGrams: 360 },
          { id: crypto.randomUUID(), foodId: "public-cooking-oil", grams: 5, locked: false, minGrams: 0, maxGrams: 20 }
        ]
      };
    }
    if (meal.id === "pre-workout") {
      return {
        ...meal,
        entries: [
          { id: crypto.randomUUID(), foodId: "public-banana-raw", grams: 150, locked: false, minGrams: 0, maxGrams: 300 },
          { id: crypto.randomUUID(), foodId: "public-oats-raw", grams: 30, locked: false, minGrams: 0, maxGrams: 120 }
        ]
      };
    }
    return {
      ...meal,
      entries: [
        { id: crypto.randomUUID(), foodId: "public-sweet-potato-cooked", grams: 220, locked: false, minGrams: 0, maxGrams: 800 },
        { id: crypto.randomUUID(), foodId: "public-chicken-breast-cooked", grams: 150, locked: false, minGrams: 0, maxGrams: 300 },
        { id: crypto.randomUUID(), foodId: "public-broccoli-cooked", grams: 150, locked: false, minGrams: 0, maxGrams: 360 },
        { id: crypto.randomUUID(), foodId: "public-cooking-oil", grams: 5, locked: false, minGrams: 0, maxGrams: 20 }
      ]
    };
  });
}

export const defaultFoods = builtinFoods;
