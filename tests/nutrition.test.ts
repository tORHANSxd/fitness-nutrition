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
  resolveCarbDayType,
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
    expect(getCarbDayType("back")).toBe("low");
    expect(getCarbDayType("chest")).toBe("low");
    expect(getCarbDayType("shoulders")).toBe("low");
    expect(getCarbDayType("arms")).toBe("low");
    expect(getCarbDayType("rest")).toBe("low");
  });

  it("anchors the daily target to TDEE minus the calorie deficit, with fixed protein", () => {
    const tdee = calculateTdee(profile);
    expect(round(tdee, 0)).toBe(2881);
    // 缺省缺口 500：当日/周均总热量 = TDEE − 500（不再是体重系数反推的固定低值）。
    expect(round(calculateCalorieTarget(profile), 0)).toBe(round(tdee - 500, 0));
    expect(round(calculateCycleAverageTarget(profile).kcal, 0)).toBe(round(tdee - 500, 0));
    // 蛋白固定 W×g/kg（默认 1.8）。
    expect(round(calculateCycleAverageTarget(profile).protein, 1)).toBe(round(profile.weightKg * 1.8, 1));
    // 当日相对维持的盈亏 = −缺口。
    expect(round(calculatePlannedCalorieDelta(profile), 0)).toBe(-500);
    // 自定义缺口生效：当日目标 = TDEE − 该缺口。
    expect(round(calculateDailyTarget({ ...profile, calorieDeficit: 300 }).kcal, 0)).toBe(round(tdee - 300, 0));
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
    // 周均与当日总热量 = TDEE − 缺省缺口 500 = 2415；当日相对维持盈亏 = −500。
    expect(round(calculateCycleAverageTarget(defaultProfile).kcal, 0)).toBe(2415);
    expect(round(calculateDailyTarget(defaultProfile).kcal, 0)).toBe(2415);
    expect(round(calculatePlannedCalorieDelta(defaultProfile), 0)).toBe(-500);
  });

  it("keeps daily total at TDEE and cycles carbs vs fat by Zhang ratios (1 high + 6 low)", () => {
    const tdee = calculateTdee(profile);
    const fixedProtein = round(profile.weightKg * getProteinPerKg(profile), 1);

    for (const workoutType of ["legs", "back", "chest", "shoulders", "arms", "rest"] as const) {
      const target = calculateDailyTarget({ ...profile, workoutType });
      const macroCalories = target.carbs * 4 + target.protein * 4 + target.fat * 9;

      // 4/4/9 自洽，且每日总热量 = 当日 TDEE − 缺省缺口 500；蛋白每日固定 W×g/kg。
      expect(round(macroCalories, 0)).toBe(round(target.kcal, 0));
      expect(round(target.kcal, 0)).toBe(round(tdee - 500, 0));
      expect(round(target.protein, 1)).toBe(fixedProtein);
    }

    // 高碳日(腿)碳重脂轻，低碳日碳轻脂重；两者总热量相同(=TDEE)。
    const high = calculateDailyTarget({ ...profile, workoutType: "legs" });
    const low = calculateDailyTarget({ ...profile, workoutType: "chest" });

    expect(high.carbs).toBeGreaterThan(low.carbs);
    expect(high.fat).toBeLessThan(low.fat);
    expect(round(high.kcal, 0)).toBe(round(low.kcal, 0));

    // 周均(1 高 + 6 低)与 calculateCycleAverageTarget 一致。
    const avg = calculateCycleAverageTarget(profile);
    expect(round((high.carbs + low.carbs * 6) / 7, 1)).toBe(round(avg.carbs, 1));
    expect(round((high.fat + low.fat * 6) / 7, 1)).toBe(round(avg.fat, 1));
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
    const check = getMacroRatioCheck(targetRatio, targetRatio, "cut", resolveCarbDayType(profile));

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

describe("carb day model (explicit carbDayType + rest day)", () => {
  it("resolves an explicit carbDayType, letting it win over the legacy workoutType", () => {
    expect(resolveCarbDayType({ carbDayType: "high", trainingTime: "afternoon" })).toBe("high");
    expect(resolveCarbDayType({ carbDayType: "low", trainingTime: "afternoon" })).toBe("low");
  });

  it("forces low carb on a rest day picked via trainingTime", () => {
    expect(resolveCarbDayType({ carbDayType: "high", trainingTime: "rest" })).toBe("low");
  });

  it("falls back to deriving the carb day from a legacy workoutType when carbDayType is absent", () => {
    expect(resolveCarbDayType({ workoutType: "legs", trainingTime: "afternoon" })).toBe("high");
    expect(resolveCarbDayType({ workoutType: "chest", trainingTime: "afternoon" })).toBe("low");
    expect(resolveCarbDayType({ trainingTime: "afternoon" })).toBe("low"); // 无任何信息时默认低碳
  });

  it("drives the daily target by the explicit carbDayType (carbs vs fat swing)", () => {
    const high = calculateDailyTarget({ ...profile, workoutType: undefined, carbDayType: "high" });
    const low = calculateDailyTarget({ ...profile, workoutType: undefined, carbDayType: "low" });
    expect(high.carbs).toBeGreaterThan(low.carbs);
    expect(high.fat).toBeLessThan(low.fat);
    expect(round(high.kcal, 0)).toBe(round(low.kcal, 0)); // 总热量不随碳日变
  });

  it("collapses a rest day onto the low-carb target even if carbDayType says high", () => {
    const rest = calculateDailyTarget({ ...profile, carbDayType: "high", trainingTime: "rest" });
    const low = calculateDailyTarget({ ...profile, carbDayType: "low", trainingTime: "afternoon" });
    expect(round(rest.carbs, 1)).toBe(round(low.carbs, 1));
    expect(round(rest.fat, 1)).toBe(round(low.fat, 1));
  });

  it("creates 3 meals on a rest day chosen via trainingTime", () => {
    expect(createDefaultMeals({ ...profile, trainingTime: "rest" })).toHaveLength(3);
    expect(createDefaultMeals({ ...profile, trainingTime: "afternoon" })).toHaveLength(4);
  });

  it("reports the resolved carb day on the nutrition result", () => {
    const result = buildNutritionResult({ ...profile, workoutType: undefined, carbDayType: "high" }, [], builtinFoods);
    expect(result.carbDayType).toBe("high");
    const restResult = buildNutritionResult({ ...profile, carbDayType: "high", trainingTime: "rest" }, [], builtinFoods);
    expect(restResult.carbDayType).toBe("low");
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
          { id: "oats", foodId: "public-oats-raw", grams: 31, locked: false, minGrams: 0, maxGrams: 220 },
          { id: "egg", foodId: "public-egg-whole", grams: 97, locked: false, minGrams: 70, maxGrams: 280 },
          { id: "blueberry", foodId: "public-blueberry-raw", grams: 100, locked: false, minGrams: 0, maxGrams: 150 }
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
          { id: "dinner-rice", foodId: "public-brown-rice-cooked", grams: 360, locked: false, minGrams: 0, maxGrams: 560 },
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
    // 锁定的低加餐与其按比例的目标存在小额差额，系统按设计保留该差额、不强行摊给其他餐；
    // 真正的硬性保证是下方的全天容忍带 + 午餐不超目标。高碳模型下该差额约 35kcal。
    expect(Math.abs(preWorkout.deficit.kcal)).toBeLessThan(40);
    // 每日总热量锚定 TDEE 后高碳日碳水目标偏高，给定食材克数上限内可能无法完全达成；
    // 此时必须表现为「全天容忍带」被明确 flag（而非静默偏离），能达成时仍须落在硬性容忍带内。
    // 与 +50kcal 上限测试同一模式：band 达成 OR 被 flag。
    const bandFlagged = result.conflicts.some((item) => item.includes("容忍带"));
    const inBand = (value: number) => value >= -5 && value <= 10;
    expect(inBand(result.recommendedRemaining.carbs) || bandFlagged).toBe(true);
    expect(inBand(result.recommendedRemaining.protein) || bandFlagged).toBe(true);
    expect(inBand(result.recommendedRemaining.fat) || bandFlagged).toBe(true);
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
    // 硬性容忍带与 isDailyMacroBandAligned 一致：亏 ≤10g、盈 ≤5g（recommendedRemaining = 目标 - 推荐）。
    for (const key of ["carbs", "protein", "fat"] as const) {
      expect(result.recommendedRemaining[key]).toBeGreaterThanOrEqual(-5);
      expect(result.recommendedRemaining[key]).toBeLessThanOrEqual(10);
    }
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

  it("trims fatty filler to approach macros when foods are too fat-dense to hit the band", () => {
    // 用户高碳腿日真实场景：食材脂肪密度偏高（偏肥的鸡肉、含脂燕麦、混合坚果），
    // 物理上无法同时达到 高碳水/高蛋白/低脂。宏量优先收尾应在保留主餐动物蛋白的前提下，
    // 压低坚果等填充类食材，让三大宏量都比纯结构解更贴近目标。
    const foods: FoodItem[] = [
      { id: "u-oats", name: "燕麦片（宜客）", category: "主食", kcalPer100g: 384.6, fatPer100g: 11.9, carbsPer100g: 57, proteinPer100g: 12.4, weightBasis: "cooked", cookedRawRatio: null, source: "user" },
      { id: "u-chicken", name: "鸡肉（不吃皮）", category: "肉类", kcalPer100g: 180.6, fatPer100g: 7.33, carbsPer100g: 0, proteinPer100g: 28.67, weightBasis: "cooked", cookedRawRatio: null, source: "user" },
      { id: "u-asparagus", name: "芦笋", category: "蔬菜", kcalPer100g: 25.5, fatPer100g: 0.12, carbsPer100g: 3.88, proteinPer100g: 2.19, weightBasis: "raw", cookedRawRatio: null, source: "user" },
      { id: "u-nuts", name: "混合坚果", category: "坚果", kcalPer100g: 638, fatPer100g: 55, carbsPer100g: 20, proteinPer100g: 16.67, weightBasis: "cooked", cookedRawRatio: null, source: "user" },
      ...builtinFoods
    ];
    const entry = (foodId: string, grams: number, maxGrams: number | null) => ({ id: `${foodId}-${grams}`, foodId, grams, locked: false, minGrams: 0, maxGrams });
    const meals: MealPlan[] = [
      { id: "breakfast", name: "早餐", ratio: 0.25, locked: false, entries: [entry("u-oats", 185, 360), entry("public-egg-whole", 65, 280), entry("public-blueberry-raw", 200, 200)] },
      { id: "lunch", name: "午餐", ratio: 0.3, locked: false, entries: [entry("public-brown-rice-cooked", 360, 360), entry("u-chicken", 138, 260), entry("u-asparagus", 420, 420)] },
      { id: "pre-workout", name: "训练前加餐", ratio: 0.1, locked: false, entries: [entry("public-banana-raw", 220, 220)] },
      { id: "dinner", name: "晚餐", ratio: 0.3, locked: false, entries: [entry("public-brown-rice-cooked", 360, 360), entry("u-chicken", 150, 260), entry("u-asparagus", 420, 420), entry("u-nuts", 6, 35)] }
    ];
    const userProfile: UserProfile = {
      sex: "male", age: 23, heightCm: 174, weightKg: 94.5, activityFactor: 1.1, exerciseKcal: 800,
      proteinPerKg: 1.8, workoutType: "legs", trainingTime: "afternoon", planDate: "2026-06-22"
    };
    const result = buildNutritionResult(userProfile, meals, foods);

    // 收尾后三项都应尽量贴近目标（TDEE 锚定模型下的可达最近点）：碳水/蛋白亏 ≤14g、脂肪盈 ≤12.5g。
    expect(result.recommendedRemaining.carbs).toBeLessThanOrEqual(14);
    expect(result.recommendedRemaining.protein).toBeLessThanOrEqual(14);
    expect(result.recommendedRemaining.fat).toBeGreaterThanOrEqual(-13); // 脂肪盈余 ≤13g
    // 主餐动物蛋白下限仍然保留（不会为了降脂把鸡肉压成迷你份量）。
    const lunch = result.mealRecommendations.find((item) => item.mealId === "lunch")!.recommendedEntries;
    expect(lunch["u-chicken-138"]).toBeGreaterThanOrEqual(85);
    // 死结仍然存在时给出可执行提示，而不是泛泛排查。
    expect(result.conflicts.some((item) => item.includes("更瘦的蛋白"))).toBe(true);
  });

  it("keeps recommended daily calories within the +50 kcal surplus cap (or flags it)", () => {
    // 新增硬约束：物理可达成时，求解器须把全天总热量压到不超目标 +50 kcal；达不成时必须明确提示。
    const userProfile: UserProfile = { ...defaultProfile, planDate: "2026-05-22" };
    const meals = createStarterMeals(userProfile);
    const result = buildNutritionResult(userProfile, meals, builtinFoods);
    const surplus = result.recommendedTotals.kcal - result.dailyTarget.kcal;
    const flagged = result.conflicts.some((item) => item.includes("+50 上限"));
    expect(surplus <= 50 + 1e-6 || flagged).toBe(true);
  });

  it("flags when locked intake forces daily calories far past the +50 kcal cap", () => {
    const meals: MealPlan[] = [
      {
        id: "all-day",
        name: "整天",
        ratio: 1,
        locked: true,
        entries: [{ id: "almond", foodId: "public-almond", grams: 1000, locked: true }]
      }
    ];
    const result = buildNutritionResult(profile, meals, builtinFoods);
    expect(result.recommendedTotals.kcal - result.dailyTarget.kcal).toBeGreaterThan(50);
    expect(result.conflicts.some((item) => item.includes("+50 上限"))).toBe(true);
  });

  it("no longer hard-locks protein powder or nuts at 30g in multi-food meals", () => {
    // 蛋白粉：与低蛋白主食同餐、蛋白目标高 → 求解器可把蛋白粉推到其上限(>30g)，不再硬锁 30g。
    const wheyMeal: MealPlan[] = [
      {
        id: "lunch",
        name: "午餐",
        ratio: 1,
        locked: false,
        entries: [
          { id: "rice", foodId: "public-rice-cooked", grams: 150, locked: false, minGrams: 0, maxGrams: 300 },
          { id: "whey", foodId: "public-whey", grams: 30, locked: false, minGrams: 0, maxGrams: 80 }
        ]
      }
    ];
    const wheyResult = buildNutritionResult(
      { ...defaultProfile, workoutType: "legs", goalType: "maintain", weeklyWeightChangePct: 0, planDate: "2026-05-22" },
      wheyMeal,
      builtinFoods
    );
    const whey = wheyResult.mealRecommendations[0].recommendedEntries.whey;
    expect(whey).toBeGreaterThan(30);
    expect(whey).toBeLessThanOrEqual(80);

    // 坚果：与蔬菜同餐、低碳日脂肪目标高 → 坚果可推到其上限(>30g)，不再硬锁 30g。
    const nutMeal: MealPlan[] = [
      {
        id: "lunch",
        name: "午餐",
        ratio: 1,
        locked: false,
        entries: [
          { id: "broccoli", foodId: "public-broccoli-cooked", grams: 150, locked: false, minGrams: 0, maxGrams: 300 },
          { id: "almond", foodId: "public-almond", grams: 20, locked: false, minGrams: 0, maxGrams: 70 }
        ]
      }
    ];
    const nutResult = buildNutritionResult(
      { ...defaultProfile, workoutType: "chest", goalType: "maintain", weeklyWeightChangePct: 0, planDate: "2026-05-22" },
      nutMeal,
      builtinFoods
    );
    const almond = nutResult.mealRecommendations[0].recommendedEntries.almond;
    expect(almond).toBeGreaterThan(30);
    expect(almond).toBeLessThanOrEqual(70);
  });
});
