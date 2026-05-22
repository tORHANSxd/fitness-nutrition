import { describe, expect, it } from "vitest";
import { createStarterMeals, defaultProfile } from "@/lib/demoState";
import { builtinFoods } from "@/lib/foods";
import {
  buildNutritionResult,
  calculateBmr,
  calculateCalorieTarget,
  calculateDailyTarget,
  calculateMacroRatio,
  calculateMealsTotals,
  calculateTdee,
  createDefaultMeals,
  getDefaultMealEntrySettings,
  getCarbDayType,
  round
} from "@/lib/nutrition";
import type { MealPlan, UserProfile } from "@/lib/types";

const profile: UserProfile = {
  sex: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityFactor: 1.45,
  exerciseKcal: 300,
  proteinPerKg: 1.2,
  bodyTypeFactor: 2.5,
  workoutType: "legs",
  trainingTime: "afternoon",
  planDate: "2026-05-22"
};

function absoluteGap(total: { kcal: number; carbs: number; protein: number; fat: number }, target: { kcal: number; carbs: number; protein: number; fat: number }) {
  return {
    kcal: Math.abs(target.kcal - total.kcal),
    carbs: Math.abs(target.carbs - total.carbs),
    protein: Math.abs(target.protein - total.protein),
    fat: Math.abs(target.fat - total.fat)
  };
}

describe("nutrition formulas", () => {
  it("uses Mifflin-St Jeor BMR", () => {
    expect(calculateBmr(profile)).toBe(1780);
    expect(calculateBmr({ ...profile, sex: "female" })).toBe(1614);
  });

  it("maps workout type to carb day type", () => {
    expect(getCarbDayType("legs")).toBe("high");
    expect(getCarbDayType("back")).toBe("high");
    expect(getCarbDayType("chest")).toBe("mid");
    expect(getCarbDayType("rest")).toBe("low");
  });

  it("sets a moderate default cut below maintenance calories", () => {
    expect(round(calculateTdee(profile), 0)).toBe(2881);
    expect(round(calculateCalorieTarget(profile), 0)).toBe(2441);
  });

  it("supports maintenance and lean bulk calorie targets", () => {
    expect(round(calculateCalorieTarget({ ...profile, goalType: "maintain", weeklyWeightChangePct: 0 }), 0)).toBe(2881);
    expect(round(calculateCalorieTarget({ ...profile, goalType: "bulk", weeklyWeightChangePct: 0.25 }), 0)).toBe(3101);
  });

  it("keeps daily macro calories aligned with target calories", () => {
    const target = calculateDailyTarget(profile);
    const macroCalories = target.carbs * 4 + target.protein * 4 + target.fat * 9;
    expect(round(macroCalories, 0)).toBe(round(target.kcal, 0));
  });

  it("calculates macro calorie ratios from grams", () => {
    const ratio = calculateMacroRatio({ kcal: 1700, carbs: 200, protein: 100, fat: 55.56 });
    expect(round(ratio.carbs, 0)).toBe(47);
    expect(round(ratio.protein, 0)).toBe(24);
    expect(round(ratio.fat, 0)).toBe(29);
  });

  it("creates training and rest meals with expected counts", () => {
    expect(createDefaultMeals(profile)).toHaveLength(4);
    expect(createDefaultMeals({ ...profile, workoutType: "rest" })).toHaveLength(3);
  });
});

describe("meal solving", () => {
  it("respects locked entries while recommending unlocked grams", () => {
    const meals: MealPlan[] = [
      {
        id: "lunch",
        name: "午餐",
        ratio: 1,
        locked: false,
        entries: [
          {
            id: "rice",
            foodId: "public-rice-cooked",
            grams: 200,
            locked: true,
            minGrams: 100,
            maxGrams: 400
          },
          {
            id: "chicken",
            foodId: "public-chicken-breast-cooked",
            grams: 100,
            locked: false,
            minGrams: 80,
            maxGrams: 300
          }
        ]
      }
    ];
    const result = buildNutritionResult({ ...profile, goalType: "maintain", weeklyWeightChangePct: 0 }, meals, builtinFoods);
    const recommendation = result.mealRecommendations[0];

    expect(recommendation.recommendedEntries.rice).toBe(200);
    expect(recommendation.recommendedEntries.chicken).toBeGreaterThanOrEqual(80);
    expect(recommendation.recommendedEntries.chicken).toBeLessThanOrEqual(300);
    expect(recommendation.actualDeficit.carbs).toBeLessThan(recommendation.target.carbs);
    expect(recommendation.targetRatio.carbs).toBeGreaterThan(0);
  });

  it("does not adjust a locked meal", () => {
    const meals: MealPlan[] = [
      {
        id: "breakfast",
        name: "早餐",
        ratio: 0.5,
        locked: true,
        entries: [
          {
            id: "oats",
            foodId: "public-oats-raw",
            grams: 40,
            locked: false
          }
        ]
      },
      {
        id: "dinner",
        name: "晚餐",
        ratio: 0.5,
        locked: false,
        entries: [
          {
            id: "beef",
            foodId: "public-lean-beef-cooked",
            grams: 120,
            locked: false,
            minGrams: 100,
            maxGrams: 260
          }
        ]
      }
    ];
    const result = buildNutritionResult({ ...profile, goalType: "maintain", weeklyWeightChangePct: 0 }, meals, builtinFoods);
    expect(result.mealRecommendations[0].recommendedEntries.oats).toBe(40);
  });

  it("allows negative remaining target when locked intake is too high", () => {
    const meals: MealPlan[] = [
      {
        id: "all-day",
        name: "整天",
        ratio: 1,
        locked: true,
        entries: [
          {
            id: "almond",
            foodId: "public-almond",
            grams: 1000,
            locked: true
          }
        ]
      }
    ];
    const result = buildNutritionResult(profile, meals, builtinFoods);
    expect(result.remaining.kcal).toBeLessThan(0);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("warns when actual intake creates a much larger deficit than planned", () => {
    const meals: MealPlan[] = [
      {
        id: "single",
        name: "单餐",
        ratio: 1,
        locked: false,
        entries: [{ id: "rice", foodId: "public-rice-cooked", grams: 100, locked: true }]
      }
    ];
    const result = buildNutritionResult(profile, meals, builtinFoods);
    expect(result.conflicts.some((item) => item.includes("实际热量缺口过大"))).toBe(true);
  });

  it("tracks recommended daily totals and remaining macro balance", () => {
    const meals: MealPlan[] = [
      {
        id: "lunch",
        name: "午餐",
        ratio: 0.5,
        locked: false,
        entries: [
          { id: "rice", foodId: "public-rice-cooked", grams: 100, locked: false },
          { id: "chicken", foodId: "public-chicken-breast-cooked", grams: 100, locked: false }
        ]
      },
      {
        id: "dinner",
        name: "晚餐",
        ratio: 0.5,
        locked: false,
        entries: [
          { id: "potato", foodId: "public-sweet-potato-cooked", grams: 120, locked: false },
          { id: "salmon", foodId: "public-salmon-cooked", grams: 120, locked: false }
        ]
      }
    ];
    const result = buildNutritionResult(profile, meals, builtinFoods);
    const actualKcalGap = Math.abs(result.remaining.kcal);
    const recommendedKcalGap = Math.abs(result.recommendedRemaining.kcal);

    expect(result.recommendedTotals.kcal).toBeGreaterThan(result.actualTotals.kcal);
    expect(recommendedKcalGap).toBeLessThan(actualKcalGap);
  });

  it("prioritizes daily calories and all three macros over per-meal portion defaults", () => {
    const userProfile: UserProfile = {
      ...defaultProfile,
      planDate: "2026-05-22"
    };
    const meals = createStarterMeals(userProfile);
    const result = buildNutritionResult(userProfile, meals, builtinFoods);
    const actualGap = absoluteGap(result.actualTotals, result.dailyTarget);
    const recommendedGap = absoluteGap(result.recommendedTotals, result.dailyTarget);

    expect(recommendedGap.kcal).toBeLessThan(actualGap.kcal);
    expect(recommendedGap.carbs).toBeLessThan(actualGap.carbs);
    expect(recommendedGap.protein).toBeLessThan(actualGap.protein);
    expect(recommendedGap.fat).toBeLessThan(actualGap.fat);
    expect(recommendedGap.kcal).toBeLessThan(80);
    expect(recommendedGap.carbs).toBeLessThan(20);
    expect(recommendedGap.protein).toBeLessThan(8);
    expect(recommendedGap.fat).toBeLessThan(5);
  });

  it("keeps vegetables present when a meal also has a large rice allowance", () => {
    const meals: MealPlan[] = [
      {
        id: "lunch",
        name: "午餐",
        ratio: 1,
        locked: false,
        entries: [
          { id: "rice", foodId: "public-rice-cooked", grams: 200, locked: false, minGrams: 0, maxGrams: 650 },
          { id: "broccoli", foodId: "public-broccoli-cooked", grams: 180, locked: false, minGrams: 0, maxGrams: 350 },
          { id: "chicken", foodId: "public-chicken-breast-cooked", grams: 160, locked: false, minGrams: 0, maxGrams: 300 }
        ]
      }
    ];
    const result = buildNutritionResult({ ...profile, goalType: "maintain", weeklyWeightChangePct: 0 }, meals, builtinFoods);
    const recommended = result.mealRecommendations[0].recommendedEntries;
    const totalGrams = recommended.rice + recommended.broccoli + recommended.chicken;

    expect(recommended.broccoli).toBeGreaterThanOrEqual(100);
    expect(recommended.chicken).toBeGreaterThanOrEqual(20);
    expect(recommended.rice).toBeLessThan(600);
    expect(recommended.rice / totalGrams).toBeLessThanOrEqual(0.62);
  });

  it("keeps displayed meal targets proportional to the daily standard after solver redistribution", () => {
    const userProfile: UserProfile = {
      ...defaultProfile,
      planDate: "2026-05-22"
    };
    const meals = createStarterMeals(userProfile);
    const result = buildNutritionResult(userProfile, meals, builtinFoods);
    const targetTotals = result.mealRecommendations.reduce(
      (total, recommendation) => ({
        kcal: total.kcal + recommendation.target.kcal,
        carbs: total.carbs + recommendation.target.carbs,
        protein: total.protein + recommendation.target.protein,
        fat: total.fat + recommendation.target.fat
      }),
      { kcal: 0, carbs: 0, protein: 0, fat: 0 }
    );

    expect(round(result.dailyTarget.protein, 1)).toBe(105);
    expect(round(result.mealRecommendations[0].target.protein, 1)).toBe(26.3);
    expect(round(result.mealRecommendations[1].target.carbs, 1)).toBe(round(result.dailyTarget.carbs * 0.35, 1));
    expect(round(targetTotals.kcal, 0)).toBe(round(result.dailyTarget.kcal, 0));
    expect(round(targetTotals.carbs, 1)).toBe(round(result.dailyTarget.carbs, 1));
    expect(round(targetTotals.protein, 1)).toBe(round(result.dailyTarget.protein, 1));
    expect(round(targetTotals.fat, 1)).toBe(round(result.dailyTarget.fat, 1));
  });

  it("calculates totals for current meal entries", () => {
    const meals: MealPlan[] = [
      {
        id: "single",
        name: "单餐",
        ratio: 1,
        locked: false,
        entries: [{ id: "rice", foodId: "public-rice-cooked", grams: 100, locked: false }]
      }
    ];
    const total = calculateMealsTotals(meals, builtinFoods);
    expect(total.kcal).toBe(129);
    expect(round(total.carbs, 2)).toBe(27.9);
  });

  it("uses category default max when user does not set max grams", () => {
    const meals: MealPlan[] = [
      {
        id: "single",
        name: "单餐",
        ratio: 1,
        locked: false,
        entries: [{ id: "rice", foodId: "public-rice-cooked", grams: 100, locked: false }]
      }
    ];
    const result = buildNutritionResult(profile, meals, builtinFoods);
    const rice = builtinFoods.find((food) => food.id === "public-rice-cooked");
    expect(rice).toBeDefined();
    expect(result.mealRecommendations[0].recommendedEntries.rice).toBeLessThanOrEqual(
      getDefaultMealEntrySettings(rice!).maxGrams
    );
  });

  it("respects an explicit user max instead of the category default max", () => {
    const meals: MealPlan[] = [
      {
        id: "single",
        name: "单餐",
        ratio: 1,
        locked: false,
        entries: [
          {
            id: "rice",
            foodId: "public-rice-cooked",
            grams: 100,
            locked: false,
            maxGrams: 200
          }
        ]
      }
    ];
    const rice = builtinFoods.find((food) => food.id === "public-rice-cooked");
    expect(rice).toBeDefined();
    expect(getDefaultMealEntrySettings(rice!).maxGrams).toBe(360);

    const result = buildNutritionResult(profile, meals, builtinFoods);
    expect(result.mealRecommendations[0].recommendedEntries.rice).toBeLessThanOrEqual(200);
  });

  it("keeps supplements and nuts inside useful single-serving ranges", () => {
    const meals: MealPlan[] = [
      {
        id: "single",
        name: "单餐",
        ratio: 1,
        locked: false,
        entries: [
          { id: "fish-oil", foodId: "public-fish-oil", grams: 2, locked: false },
          { id: "almond", foodId: "public-almond", grams: 20, locked: false }
        ]
      }
    ];
    const result = buildNutritionResult(profile, meals, builtinFoods);
    expect(result.mealRecommendations[0].recommendedEntries["fish-oil"]).toBeLessThanOrEqual(5);
    expect(result.mealRecommendations[0].recommendedEntries.almond).toBeLessThanOrEqual(35);
  });

  it("uses a small serving range for cooking oil", () => {
    const oil = builtinFoods.find((food) => food.id === "public-cooking-oil");
    expect(oil).toBeDefined();
    expect(getDefaultMealEntrySettings(oil!)).toEqual({
      grams: 10,
      minGrams: 0,
      maxGrams: 20
    });

    const meals: MealPlan[] = [
      {
        id: "single",
        name: "单餐",
        ratio: 1,
        locked: false,
        entries: [{ id: "oil", foodId: "public-cooking-oil", grams: 10, locked: false }]
      }
    ];
    const result = buildNutritionResult(profile, meals, builtinFoods);
    expect(result.mealRecommendations[0].recommendedEntries.oil).toBeLessThanOrEqual(20);
  });
});
