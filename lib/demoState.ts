import { builtinFoods } from "@/lib/foods";
import { createDefaultMeals } from "@/lib/nutrition";
import type { MealPlan, UserProfile } from "@/lib/types";

// demo 档案（未配置 Supabase 的演示模式与测试用）：v2 文档对象本人，174cm / 93.2kg / 26%（2026-07-04 体测）。
// TDEE≈2895 − 赤字600 → 目标≈2295，公式复现文档"2300 kcal / 蛋白 175 起"。
export const defaultProfile: UserProfile = {
  sex: "male",
  age: 24,
  heightCm: 174,
  weightKg: 93.2,
  bodyFatPct: 26,
  activityFactor: 1.1,
  exerciseKcal: 800,
  goalType: "cut",
  trainingTime: "afternoon",
  planDate: new Date().toISOString().slice(0, 10)
};

// 新账号（登录后无草稿）的起点：身体数据一律留空，由用户自己填或从体测记录同步；
// 档案不完整时目标为 0，计划页给引导提示。activityFactor 给 1.1 作合理缺省。
export const emptyProfile: UserProfile = {
  sex: "male",
  age: 0,
  heightCm: 0,
  weightKg: 0,
  bodyFatPct: null,
  activityFactor: 1.1,
  exerciseKcal: 0,
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
