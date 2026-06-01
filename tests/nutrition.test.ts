import { describe, expect, it } from "vitest";
import { createStarterMeals, defaultProfile } from "@/lib/demoState";
import { builtinFoods } from "@/lib/foods";
import {
  buildNutritionResult,
  calculateFoodKcalPer100g,
  calculateFoodTotals,
  calculateBmr,
  calculateCalorieTarget,
  calculateCycleAverageTarget,
  calculateDailyTarget,
  calculateMacroRatio,
  calculateMealsTotals,
  calculatePlannedCalorieDelta,
  calculateTdee,
  createDefaultMeals,
  getDefaultMealEntrySettings,
  getFoodEnergyMismatch,
  getMacroRatioCheck,
  getCarbDayType,
  getProteinPerKg,
  round
} from "@/lib/nutrition";
import type { FoodItem, MealPlan, UserProfile } from "@/lib/types";

const profile: UserProfile = {
  sex: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityFactor: 1.45,
  exerciseKcal: 300,
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

function mealRecommendedTotals(meal: MealPlan, result: ReturnType<typeof buildNutritionResult>, foods: FoodItem[]) {
  const recommendation = result.mealRecommendations.find((item) => item.mealId === meal.id);
  expect(recommendation).toBeDefined();
  return meal.entries.reduce(
    (total, entry) => {
      const food = foods.find((item) => item.id === entry.foodId);
      if (!food) {
        return total;
      }
      const grams = recommendation!.recommendedEntries[entry.id] ?? entry.grams;
      const foodTotals = calculateFoodTotals(food, grams);
      return {
        kcal: total.kcal + foodTotals.kcal,
        carbs: total.carbs + foodTotals.carbs,
        protein: total.protein + foodTotals.protein,
        fat: total.fat + foodTotals.fat
      };
    },
    { kcal: 0, carbs: 0, protein: 0, fat: 0 }
  );
}

function nonSupplementRecommendedGrams(meal: MealPlan, result: ReturnType<typeof buildNutritionResult>, foods: FoodItem[]) {
  const recommendation = result.mealRecommendations.find((item) => item.mealId === meal.id);
  expect(recommendation).toBeDefined();
  return meal.entries.reduce((total, entry) => {
    const food = foods.find((item) => item.id === entry.foodId);
    if (!food || food.category === "补剂") {
      return total;
    }
    return total + (recommendation!.recommendedEntries[entry.id] ?? entry.grams);
  }, 0);
}

describe("nutrition formulas", () => {
  it("uses Mifflin-St Jeor BMR", () => {
    expect(calculateBmr(profile)).toBe(1780);
    expect(calculateBmr({ ...profile, sex: "female" })).toBe(1614);
  });

  it("maps workout type to carb day type", () => {
    expect(getCarbDayType("legs")).toBe("high");
    expect(getCarbDayType("back")).toBe("mid");
    expect(getCarbDayType("chest")).toBe("mid");
    expect(getCarbDayType("rest")).toBe("low");
  });

  it("calculates the Kaisheng cycle-average calorie target", () => {
    expect(round(calculateTdee(profile), 0)).toBe(2881);
    expect(round(calculateCalorieTarget(profile), 0)).toBe(1792);
    expect(round(calculateCycleAverageTarget(profile).carbs, 1)).toBe(160);
    expect(round(calculateCycleAverageTarget(profile).protein, 1)).toBe(144);
    expect(round(calculateCycleAverageTarget(profile).fat, 1)).toBe(64);
    expect(round(calculatePlannedCalorieDelta(profile), 0)).toBe(-1089);
  });

  it("uses the requested default body profile for the Kaisheng plan", () => {
    expect(defaultProfile.sex).toBe("male");
    expect(defaultProfile.age).toBe(23);
    expect(defaultProfile.heightCm).toBe(174);
    expect(defaultProfile.weightKg).toBe(94.5);
    expect(defaultProfile.activityFactor).toBe(1.1);
    expect(defaultProfile.exerciseKcal).toBe(800);

    expect(round(calculateBmr(defaultProfile), 1)).toBe(1922.5);
    expect(round(calculateTdee(defaultProfile), 0)).toBe(2915);
    expect(round(calculateCycleAverageTarget(defaultProfile).kcal, 0)).toBe(2117);
    expect(round(calculateDailyTarget(defaultProfile).kcal, 0)).toBe(2361);
    expect(round(calculatePlannedCalorieDelta(defaultProfile), 0)).toBe(-798);
  });

  it("uses Kaisheng weekly carb and fat redistribution for easy-fat-gain cutting", () => {
    const expectedByWorkout = [
      { workoutType: "legs", expected: { carbs: 280, protein: 144, fat: 33.6 } },
      { workoutType: "back", expected: { carbs: 130.67, protein: 144, fat: 52.27 } },
      { workoutType: "chest", expected: { carbs: 130.67, protein: 144, fat: 52.27 } },
      { workoutType: "rest", expected: { carbs: 84, protein: 144, fat: 112 } }
    ] as const;

    for (const { workoutType, expected } of expectedByWorkout) {
      const target = calculateDailyTarget({ ...profile, workoutType });
      const macroCalories = target.carbs * 4 + target.protein * 4 + target.fat * 9;

      expect(round(macroCalories, 0)).toBe(round(target.kcal, 0));
      expect(round(target.carbs, 2)).toBe(expected.carbs);
      expect(round(target.protein, 2)).toBe(expected.protein);
      expect(round(target.fat, 2)).toBe(expected.fat);
    }

    const high = calculateDailyTarget({ ...profile, workoutType: "legs" });
    const mid = calculateDailyTarget({ ...profile, workoutType: "chest" });
    const low = calculateDailyTarget({ ...profile, workoutType: "rest" });

    expect(round(high.carbs * 2 + mid.carbs * 3 + low.carbs * 2, 1)).toBe(profile.weightKg * 2 * 7);
    expect(round(high.fat * 2 + mid.fat * 3 + low.fat * 2, 1)).toBe(profile.weightKg * 0.8 * 7);
    expect(round(high.protein, 1)).toBe(round(mid.protein, 1));
    expect(round(mid.protein, 1)).toBe(round(low.protein, 1));
  });

  it("clamps daily fixed protein inside Kaisheng 1.6-2.2 g/kg range", () => {
    expect(getProteinPerKg({ proteinPerKg: 1.2 })).toBe(1.6);
    expect(getProteinPerKg({ proteinPerKg: 1.9 })).toBe(1.9);
    expect(getProteinPerKg({ proteinPerKg: 2.6 })).toBe(2.2);
    expect(round(calculateDailyTarget({ ...profile, proteinPerKg: 1.6 }).protein, 1)).toBe(128);
    expect(round(calculateDailyTarget({ ...profile, proteinPerKg: 2.2 }).protein, 1)).toBe(176);
  });

  it("calculates macro calorie ratios from grams", () => {
    const ratio = calculateMacroRatio({ kcal: 1700, carbs: 200, protein: 100, fat: 55.56 });
    expect(round(ratio.carbs, 0)).toBe(47);
    expect(round(ratio.protein, 0)).toBe(24);
    expect(round(ratio.fat, 0)).toBe(29);
  });

  it("checks macro ratios against carb cycle targets and goal ranges", () => {
    const target = calculateDailyTarget(profile);
    const targetRatio = calculateMacroRatio(target);
    const check = getMacroRatioCheck(targetRatio, targetRatio, "cut", getCarbDayType(profile.workoutType));

    expect(check.cycleAligned).toBe(true);
    expect(check.goalAligned).toBe(true);
  });

  it("keeps high, mid, and low carb day ratios inside carb-cycle ranges", () => {
    for (const workoutType of ["legs", "chest", "back", "rest"] as const) {
      const target = calculateDailyTarget({ ...profile, workoutType });
      const ratio = calculateMacroRatio(target);
      const check = getMacroRatioCheck(ratio, ratio, "cut", getCarbDayType(workoutType));

      expect(check.goalAligned).toBe(true);
    }
  });

  it("detects food energy data that conflicts with macro calories", () => {
    const badOats = {
      kcalPer100g: 38,
      carbsPer100g: 57.1,
      proteinPer100g: 12.3,
      fatPer100g: 11.9
    };

    expect(getFoodEnergyMismatch(badOats).severity).toBe("error");
    expect(builtinFoods.every((food) => getFoodEnergyMismatch(food).severity !== "error")).toBe(true);
  });

  it("uses net carbs for built-in vegetables as the energy macro record", () => {
    const expectedVegetableNetCarbs = {
      "public-broccoli-cooked": 3.88,
      "public-spinach-cooked": 1.35,
      "public-lettuce-raw": 1.57,
      "public-tomato-raw": 2.72,
      "public-cucumber-raw": 3.13
    };

    for (const [foodId, expectedCarbs] of Object.entries(expectedVegetableNetCarbs)) {
      const food = builtinFoods.find((item) => item.id === foodId);
      expect(food).toBeDefined();
      expect(food?.category).toBe("蔬菜");
      expect(food?.carbsPer100g).toBe(expectedCarbs);
      expect(round(calculateFoodTotals(food!, 100).kcal, 1)).toBe(round(calculateFoodKcalPer100g(food!), 1));
    }
  });

  it("calculates food calories from macros instead of the stored kcal field", () => {
    const food: FoodItem = {
      id: "macro-energy",
      name: "宏量热量测试",
      category: "主食",
      kcalPer100g: 999,
      fatPer100g: 1,
      carbsPer100g: 20,
      proteinPer100g: 5,
      weightBasis: "cooked",
      cookedRawRatio: null,
      source: "user"
    };

    expect(calculateFoodTotals(food, 100).kcal).toBe(109);
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

  it("improves daily calories and macros without collapsing practical portions", () => {
    const userProfile: UserProfile = {
      ...defaultProfile,
      planDate: "2026-05-22"
    };
    const meals = createStarterMeals(userProfile);
    const result = buildNutritionResult(userProfile, meals, builtinFoods);
    const actualGap = absoluteGap(result.actualTotals, result.dailyTarget);
    const recommendedGap = absoluteGap(result.recommendedTotals, result.dailyTarget);
    const breakfast = meals.find((meal) => meal.id === "breakfast")!;
    const wheyEntry = breakfast.entries.find((entry) => entry.foodId === "public-whey")!;
    const breakfastRecommendation = result.mealRecommendations.find((item) => item.mealId === "breakfast")!;

    expect(recommendedGap.kcal).toBeLessThan(actualGap.kcal);
    expect(recommendedGap.carbs).toBeLessThan(actualGap.carbs);
    expect(recommendedGap.protein).toBeLessThan(actualGap.protein);
    expect(recommendedGap.fat).toBeLessThan(actualGap.fat);
    expect(breakfastRecommendation.recommendedEntries[wheyEntry.id]).toBeGreaterThanOrEqual(20);
    expect(recommendedGap.kcal).toBeLessThan(180);
    expect(recommendedGap.carbs).toBeLessThan(40);
    expect(recommendedGap.protein).toBeLessThan(10);
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
    expect(recommended.chicken).toBeGreaterThanOrEqual(85);
    expect(recommended.rice).toBeLessThanOrEqual(420);
    expect(recommended.rice / totalGrams).toBeLessThanOrEqual(0.62);
  });

  it("keeps normal animal protein servings in structured main meals", () => {
    const foods: FoodItem[] = [
      ...builtinFoods,
      {
        id: "test-bun",
        name: "杂粮馒头",
        category: "主食",
        kcalPer100g: 251,
        fatPer100g: 3.87,
        carbsPer100g: 46.4,
        proteinPer100g: 10,
        weightBasis: "cooked",
        cookedRawRatio: null,
        source: "user"
      }
    ];
    const meals: MealPlan[] = [
      {
        id: "breakfast",
        name: "早餐",
        ratio: 0.25,
        locked: false,
        entries: [
          { id: "oats", foodId: "public-oats-raw", grams: 130, locked: false, minGrams: 0, maxGrams: 130 },
          { id: "egg", foodId: "public-egg-whole", grams: 26, locked: false, minGrams: 0, maxGrams: 280 },
          { id: "blueberry", foodId: "public-blueberry-raw", grams: 200, locked: false, minGrams: 0, maxGrams: 200 }
        ]
      },
      {
        id: "lunch",
        name: "午餐",
        ratio: 0.35,
        locked: false,
        entries: [
          { id: "rice", foodId: "public-rice-cooked", grams: 420, locked: false, minGrams: 0, maxGrams: 650 },
          { id: "chicken", foodId: "public-chicken-breast-cooked", grams: 30, locked: false, minGrams: 0, maxGrams: 260 },
          { id: "broccoli", foodId: "public-broccoli-cooked", grams: 350, locked: false, minGrams: 0, maxGrams: 350 },
          { id: "oil", foodId: "public-cooking-oil", grams: 10, locked: false, minGrams: 0, maxGrams: 20 }
        ]
      },
      {
        id: "pre-workout",
        name: "训练前加餐",
        ratio: 0.1,
        locked: false,
        entries: [
          { id: "bun", foodId: "test-bun", grams: 43, locked: true, minGrams: 0, maxGrams: 360 },
          { id: "protein", foodId: "public-whey", grams: 30, locked: true, minGrams: 0, maxGrams: 40 }
        ]
      },
      {
        id: "dinner",
        name: "晚餐",
        ratio: 0.3,
        locked: false,
        entries: [
          { id: "dinner-chicken", foodId: "public-chicken-breast-cooked", grams: 22.5, locked: false, minGrams: 0, maxGrams: 260 },
          { id: "dinner-rice", foodId: "public-brown-rice-cooked", grams: 360, locked: false, minGrams: 0, maxGrams: 360 },
          { id: "dinner-oil", foodId: "public-cooking-oil", grams: 10, locked: false, minGrams: 0, maxGrams: 20 },
          { id: "dinner-broccoli", foodId: "public-broccoli-cooked", grams: 348, locked: false, minGrams: 0, maxGrams: 420 }
        ]
      }
    ];
    const result = buildNutritionResult({ ...defaultProfile, planDate: "2026-05-22" }, meals, foods);
    const breakfast = result.mealRecommendations.find((item) => item.mealId === "breakfast")!.recommendedEntries;
    const lunch = result.mealRecommendations.find((item) => item.mealId === "lunch")!.recommendedEntries;
    const dinner = result.mealRecommendations.find((item) => item.mealId === "dinner")!.recommendedEntries;
    const lunchTotal = lunch.rice + lunch.chicken + lunch.broccoli;
    const dinnerTotal = dinner["dinner-rice"] + dinner["dinner-chicken"] + dinner["dinner-broccoli"];

    expect(breakfast.egg).toBeGreaterThanOrEqual(60);
    expect(lunch.chicken).toBeGreaterThanOrEqual(85);
    expect(dinner["dinner-chicken"]).toBeGreaterThanOrEqual(85);
    expect(lunch.rice).toBeLessThanOrEqual(420);
    expect(lunch.chicken / lunchTotal).toBeGreaterThanOrEqual(0.1);
    expect(dinner["dinner-chicken"] / dinnerTotal).toBeGreaterThanOrEqual(0.1);
    expect(nonSupplementRecommendedGrams(meals[1], result, foods)).toBeLessThanOrEqual(950);
  });

  it("keeps a locked low pre-workout meal from making lunch absorb the whole daily gap", () => {
    const foods: FoodItem[] = [
      ...builtinFoods,
      {
        id: "test-bun",
        name: "杂粮馒头",
        category: "主食",
        kcalPer100g: 251,
        fatPer100g: 3.87,
        carbsPer100g: 46.4,
        proteinPer100g: 10,
        weightBasis: "cooked",
        cookedRawRatio: null,
        source: "user"
      },
      {
        id: "test-light-protein",
        name: "低热量蛋白粉",
        category: "补剂",
        kcalPer100g: 117,
        fatPer100g: 1.33,
        carbsPer100g: 4,
        proteinPer100g: 22.33,
        weightBasis: "raw",
        cookedRawRatio: null,
        source: "user"
      }
    ];
    const meals: MealPlan[] = [
      {
        id: "breakfast",
        name: "早餐",
        ratio: 0.25,
        locked: false,
        entries: [
          { id: "oats", foodId: "public-oats-raw", grams: 31, locked: false, minGrams: 0, maxGrams: 120 },
          { id: "egg", foodId: "public-egg-whole", grams: 97, locked: false, minGrams: 70, maxGrams: 280 },
          { id: "blueberry", foodId: "public-blueberry-raw", grams: 100, locked: false, minGrams: 0, maxGrams: 100 }
        ]
      },
      {
        id: "lunch",
        name: "午餐",
        ratio: 0.3,
        locked: false,
        entries: [
          { id: "rice", foodId: "public-brown-rice-cooked", grams: 540, locked: false, minGrams: 0, maxGrams: 900 },
          { id: "chicken", foodId: "public-chicken-breast-cooked", grams: 154, locked: false, minGrams: 0, maxGrams: 260 },
          { id: "broccoli", foodId: "public-broccoli-cooked", grams: 420, locked: false, minGrams: 0, maxGrams: 420 },
          { id: "oil", foodId: "public-cooking-oil", grams: 1.5, locked: false, minGrams: 0, maxGrams: 20 }
        ]
      },
      {
        id: "pre-workout",
        name: "训练前加餐",
        ratio: 0.15,
        locked: false,
        entries: [
          { id: "bun", foodId: "test-bun", grams: 75, locked: true, minGrams: 0, maxGrams: 360 },
          { id: "protein", foodId: "test-light-protein", grams: 30, locked: true, minGrams: 0, maxGrams: 280 }
        ]
      },
      {
        id: "dinner",
        name: "晚餐",
        ratio: 0.3,
        locked: false,
        entries: [
          { id: "dinner-chicken", foodId: "public-chicken-breast-cooked", grams: 103, locked: false, minGrams: 0, maxGrams: 260 },
          { id: "dinner-rice", foodId: "public-brown-rice-cooked", grams: 360, locked: false, minGrams: 0, maxGrams: 360 },
          { id: "dinner-broccoli", foodId: "public-broccoli-cooked", grams: 420, locked: false, minGrams: 0, maxGrams: 420 },
          { id: "dinner-oil", foodId: "public-cooking-oil", grams: 1.5, locked: false, minGrams: 0, maxGrams: 20 }
        ]
      }
    ];
    const userProfile: UserProfile = {
      ...defaultProfile,
      planDate: "2026-05-22"
    };
    const result = buildNutritionResult(userProfile, meals, foods);
    const lunch = meals[1];
    const lunchTarget = result.mealRecommendations.find((item) => item.mealId === "lunch")!.target;
    const lunchTotals = mealRecommendedTotals(lunch, result, foods);
    const lunchKcalTolerance = Math.max(80, lunchTarget.kcal * 0.15);
    const preWorkout = result.mealRecommendations.find((item) => item.mealId === "pre-workout")!;

    expect(lunchTotals.kcal).toBeLessThanOrEqual(lunchTarget.kcal + lunchKcalTolerance);
    expect(nonSupplementRecommendedGrams(lunch, result, foods)).toBeLessThanOrEqual(950);
    expect(Math.abs(preWorkout.deficit.kcal)).toBeLessThan(20);
    expect(result.recommendedRemaining.carbs).toBeGreaterThanOrEqual(-5);
    expect(result.recommendedRemaining.carbs).toBeLessThanOrEqual(10);
    expect(result.recommendedRemaining.protein).toBeGreaterThanOrEqual(-5);
    expect(result.recommendedRemaining.protein).toBeLessThanOrEqual(10);
    expect(result.recommendedRemaining.fat).toBeGreaterThanOrEqual(-5);
    expect(result.recommendedRemaining.fat).toBeLessThanOrEqual(10);
    expect(result.conflicts.some((item) => item.includes("训练前加餐 有锁定项"))).toBe(false);
  });

  it("dynamically redistributes displayed meal targets after solver balancing", () => {
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

    expect(round(result.dailyTarget.protein, 1)).toBe(round(userProfile.weightKg * getProteinPerKg(userProfile), 1));
    expect(round(result.mealRecommendations[0].target.protein, 1)).not.toBe(round(result.dailyTarget.protein * meals[0].ratio, 1));
    expect(Math.abs(result.recommendedRemaining.carbs)).toBeLessThanOrEqual(5);
    expect(Math.abs(result.recommendedRemaining.protein)).toBeLessThanOrEqual(5);
    expect(Math.abs(result.recommendedRemaining.fat)).toBeLessThanOrEqual(5);
    expect(Math.abs(targetTotals.kcal - result.dailyTarget.kcal)).toBeLessThan(1);
    expect(round(targetTotals.carbs, 1)).toBe(round(result.dailyTarget.carbs, 1));
    expect(round(targetTotals.protein, 1)).toBe(round(result.dailyTarget.protein, 1));
    expect(round(targetTotals.fat, 1)).toBe(round(result.dailyTarget.fat, 1));

    for (const meal of meals) {
      const recommendation = result.mealRecommendations.find((item) => item.mealId === meal.id)!;
      const totals = mealRecommendedTotals(meal, result, builtinFoods);
      const tolerance = Math.max(80, recommendation.target.kcal * 0.15);
      expect(Math.abs(totals.kcal - recommendation.target.kcal)).toBeLessThanOrEqual(tolerance);
    }
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
    expect(round(total.kcal, 1)).toBe(124.8);
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
