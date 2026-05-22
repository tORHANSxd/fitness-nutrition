import type {
  CarbDayType,
  FoodItem,
  MacroRatio,
  MacroTotals,
  MealFoodEntry,
  MealPlan,
  NutritionResult,
  TrainingTime,
  UserProfile,
  WorkoutType
} from "@/lib/types";

export const zeroTotals: MacroTotals = {
  kcal: 0,
  carbs: 0,
  protein: 0,
  fat: 0
};

const macroWeights: Record<keyof MacroTotals, number> = {
  kcal: 5,
  protein: 2,
  carbs: 1,
  fat: 1
};

const carbRatios: Record<CarbDayType, number> = {
  high: 0.5 / 2,
  mid: 0.35 / 3,
  low: 0.15 / 2
};

const fatRatios: Record<CarbDayType, number> = {
  high: 0.15 / 2,
  mid: 0.35 / 3,
  low: 0.5 / 2
};

export const carbCycleMacroSource =
  "凯圣王碳循环：周碳水高/中/低分配为50%/35%/15%，周脂肪高/中/低分配为15%/35%/50%，蛋白每日稳定。";

export const workoutLabels: Record<WorkoutType, string> = {
  legs: "腿部",
  back: "背部",
  chest: "胸部",
  shoulders: "肩部",
  arms: "手臂",
  rest: "休息"
};

export const carbDayLabels: Record<CarbDayType, string> = {
  high: "高碳日",
  mid: "中碳日",
  low: "低碳日"
};

export const trainingTimeLabels: Record<TrainingTime, string> = {
  morning: "上午训练",
  afternoon: "午后训练",
  evening: "傍晚训练"
};

export function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function addTotals(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    kcal: a.kcal + b.kcal,
    carbs: a.carbs + b.carbs,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat
  };
}

export function subtractTotals(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    kcal: a.kcal - b.kcal,
    carbs: a.carbs - b.carbs,
    protein: a.protein - b.protein,
    fat: a.fat - b.fat
  };
}

export function scaleTotals(total: MacroTotals, ratio: number): MacroTotals {
  return {
    kcal: total.kcal * ratio,
    carbs: total.carbs * ratio,
    protein: total.protein * ratio,
    fat: total.fat * ratio
  };
}

export function calculateMacroCalories(total: MacroTotals) {
  return {
    carbs: total.carbs * 4,
    protein: total.protein * 4,
    fat: total.fat * 9
  };
}

export function calculateMacroRatio(total: MacroTotals): MacroRatio {
  const calories = calculateMacroCalories(total);
  const sum = calories.carbs + calories.protein + calories.fat;
  if (sum <= 0) {
    return { carbs: 0, protein: 0, fat: 0 };
  }
  return {
    carbs: (calories.carbs / sum) * 100,
    protein: (calories.protein / sum) * 100,
    fat: (calories.fat / sum) * 100
  };
}

export function clamp(value: number, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.min(Math.max(value, min), max);
}

export function calculateBmr(profile: Pick<UserProfile, "sex" | "age" | "heightCm" | "weightKg">) {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  return profile.sex === "male" ? base + 5 : base - 161;
}

export function calculateTdee(profile: UserProfile) {
  return calculateBmr(profile) * profile.activityFactor + profile.exerciseKcal;
}

export function getCarbDayType(workoutType: WorkoutType): CarbDayType {
  if (workoutType === "legs" || workoutType === "back") {
    return "high";
  }
  if (workoutType === "rest") {
    return "low";
  }
  return "mid";
}

export function calculateDailyTarget(profile: UserProfile): MacroTotals {
  const carbDayType = getCarbDayType(profile.workoutType);
  const tdee = calculateTdee(profile);
  const protein = profile.weightKg * profile.proteinPerKg;
  const weeklyCarbs = profile.weightKg * profile.bodyTypeFactor * 7;
  const fatParameter = 0.8 + (profile.bodyTypeFactor - 2) * 0.3;
  const weeklyFat = profile.weightKg * fatParameter * 7;
  const rawCarbs = weeklyCarbs * carbRatios[carbDayType];
  const rawFat = weeklyFat * fatRatios[carbDayType];
  const caloriesAfterProtein = Math.max(tdee - protein * 4, 0);
  const rawCarbFatCalories = rawCarbs * 4 + rawFat * 9;
  const scale = rawCarbFatCalories > 0 ? caloriesAfterProtein / rawCarbFatCalories : 1;

  return {
    kcal: tdee,
    protein,
    carbs: rawCarbs * scale,
    fat: rawFat * scale
  };
}

export function calculateFoodTotals(food: FoodItem, grams: number): MacroTotals {
  const ratio = grams / 100;
  return {
    kcal: food.kcalPer100g * ratio,
    carbs: food.carbsPer100g * ratio,
    protein: food.proteinPer100g * ratio,
    fat: food.fatPer100g * ratio
  };
}

export function calculateMealTotals(meal: MealPlan, foodsById: Map<string, FoodItem>): MacroTotals {
  return meal.entries.reduce((total, entry) => {
    const food = foodsById.get(entry.foodId);
    if (!food) {
      return total;
    }
    return addTotals(total, calculateFoodTotals(food, entry.grams));
  }, zeroTotals);
}

export function calculateMealsTotals(meals: MealPlan[], foods: FoodItem[]) {
  const foodsById = new Map(foods.map((food) => [food.id, food]));
  return meals.reduce((total, meal) => addTotals(total, calculateMealTotals(meal, foodsById)), zeroTotals);
}

export function createDefaultMeals(profile: UserProfile): MealPlan[] {
  if (profile.workoutType === "rest") {
    return [
      { id: "breakfast", name: "早餐", ratio: 0.3, locked: false, entries: [] },
      { id: "lunch", name: "午餐", ratio: 0.4, locked: false, entries: [] },
      { id: "dinner", name: "晚餐", ratio: 0.3, locked: false, entries: [] }
    ];
  }

  const ratiosByTime: Record<TrainingTime, number[]> = {
    morning: [0.28, 0.32, 0.1, 0.3],
    afternoon: [0.25, 0.35, 0.1, 0.3],
    evening: [0.25, 0.3, 0.15, 0.3]
  };
  const [breakfast, lunch, snack, dinner] = ratiosByTime[profile.trainingTime];

  return [
    { id: "breakfast", name: "早餐", ratio: breakfast, locked: false, entries: [] },
    { id: "lunch", name: "午餐", ratio: lunch, locked: false, entries: [] },
    { id: "pre-workout", name: "训练前加餐", ratio: snack, locked: false, entries: [] },
    { id: "dinner", name: "晚餐", ratio: dinner, locked: false, entries: [] }
  ];
}

function entryBounds(entry: MealFoodEntry) {
  const min = Math.max(entry.minGrams ?? 0, 0);
  const max = entry.maxGrams == null ? Number.POSITIVE_INFINITY : Math.max(entry.maxGrams, min);
  return { min, max };
}

function solveMealEntries(
  meal: MealPlan,
  mealTarget: MacroTotals,
  foodsById: Map<string, FoodItem>
) {
  const recommended = Object.fromEntries(meal.entries.map((entry) => [entry.id, entry.grams]));
  const adjustable = meal.entries.filter((entry) => !entry.locked && foodsById.has(entry.foodId));

  if (meal.locked || adjustable.length === 0) {
    return recommended;
  }

  for (const entry of adjustable) {
    const { min, max } = entryBounds(entry);
    recommended[entry.id] = clamp(recommended[entry.id] ?? entry.grams, min, max);
  }

  for (let iteration = 0; iteration < 36; iteration += 1) {
    for (const entry of adjustable) {
      const food = foodsById.get(entry.foodId);
      if (!food) {
        continue;
      }
      const currentGrams = recommended[entry.id] ?? entry.grams;
      const currentTotals = calculateTotalsFromEntries(meal.entries, recommended, foodsById);
      const diff = subtractTotals(currentTotals, mealTarget);
      const vector: MacroTotals = {
        kcal: food.kcalPer100g / 100,
        carbs: food.carbsPer100g / 100,
        protein: food.proteinPer100g / 100,
        fat: food.fatPer100g / 100
      };
      let numerator = 0;
      let denominator = 0;
      for (const key of Object.keys(vector) as Array<keyof MacroTotals>) {
        const scale = Math.max(Math.abs(mealTarget[key]), 25);
        numerator += macroWeights[key] * diff[key] * vector[key] / (scale * scale);
        denominator += macroWeights[key] * vector[key] * vector[key] / (scale * scale);
      }
      if (denominator === 0) {
        continue;
      }
      const { min, max } = entryBounds(entry);
      recommended[entry.id] = round(clamp(currentGrams - numerator / denominator, min, max), 1);
    }
  }

  return recommended;
}

function calculateTotalsFromEntries(
  entries: MealFoodEntry[],
  gramsByEntryId: Record<string, number>,
  foodsById: Map<string, FoodItem>
): MacroTotals {
  return entries.reduce((total, entry) => {
    const food = foodsById.get(entry.foodId);
    if (!food) {
      return total;
    }
    return addTotals(total, calculateFoodTotals(food, gramsByEntryId[entry.id] ?? entry.grams));
  }, zeroTotals);
}

function deficitMessage(label: string, deficit: MacroTotals) {
  const parts = [
    `${round(deficit.kcal, 0)} kcal`,
    `碳水 ${round(deficit.carbs)}g`,
    `蛋白 ${round(deficit.protein)}g`,
    `脂肪 ${round(deficit.fat)}g`
  ];
  return `${label} 差额：${parts.join(" / ")}`;
}

export function buildNutritionResult(profile: UserProfile, meals: MealPlan[], foods: FoodItem[]): NutritionResult {
  const foodsById = new Map(foods.map((food) => [food.id, food]));
  const dailyTarget = calculateDailyTarget(profile);
  const actualTotals = calculateMealsTotals(meals, foods);
  const lockedMealTotals = meals
    .filter((meal) => meal.locked)
    .reduce((total, meal) => addTotals(total, calculateMealTotals(meal, foodsById)), zeroTotals);
  const unlockedMeals = meals.filter((meal) => !meal.locked);
  const unlockedRatioSum = unlockedMeals.reduce((sum, meal) => sum + meal.ratio, 0);
  const remainingAfterLockedMeals = subtractTotals(dailyTarget, lockedMealTotals);
  const conflicts: string[] = [];

  if (Object.values(remainingAfterLockedMeals).some((value) => value < 0)) {
    conflicts.push(deficitMessage("锁定餐已超过目标", remainingAfterLockedMeals));
  }

  const mealRecommendations = meals.map((meal) => {
    const mealActual = calculateMealTotals(meal, foodsById);
    const mealTarget = meal.locked
      ? mealActual
      : scaleTotals(
          {
            kcal: Math.max(remainingAfterLockedMeals.kcal, 0),
            carbs: Math.max(remainingAfterLockedMeals.carbs, 0),
            protein: Math.max(remainingAfterLockedMeals.protein, 0),
            fat: Math.max(remainingAfterLockedMeals.fat, 0)
          },
          unlockedRatioSum > 0 ? meal.ratio / unlockedRatioSum : 0
        );
    const recommendedEntries = solveMealEntries(meal, mealTarget, foodsById);
    const recommendedTotals = calculateTotalsFromEntries(meal.entries, recommendedEntries, foodsById);
    const deficit = subtractTotals(mealTarget, recommendedTotals);
    const actualDeficit = subtractTotals(mealTarget, mealActual);

    if (!meal.locked && meal.entries.length > 0) {
      const hasLargeDeficit =
        Math.abs(deficit.kcal) > 80 ||
        Math.abs(deficit.carbs) > 15 ||
        Math.abs(deficit.protein) > 12 ||
        Math.abs(deficit.fat) > 8;
      if (hasLargeDeficit) {
        conflicts.push(deficitMessage(`${meal.name} 推荐值无法贴合目标`, deficit));
      }
    }

    return {
      mealId: meal.id,
      target: mealTarget,
      actual: mealActual,
      actualDeficit,
      targetRatio: calculateMacroRatio(mealTarget),
      actualRatio: calculateMacroRatio(mealActual),
      recommendedEntries,
      deficit
    };
  });

  return {
    bmr: calculateBmr(profile),
    tdee: calculateTdee(profile),
    carbDayType: getCarbDayType(profile.workoutType),
    dailyTarget,
    actualTotals,
    targetRatio: calculateMacroRatio(dailyTarget),
    actualRatio: calculateMacroRatio(actualTotals),
    remaining: subtractTotals(dailyTarget, actualTotals),
    mealRecommendations,
    conflicts: Array.from(new Set(conflicts))
  };
}

export function convertWeightLabel(food: FoodItem, grams: number) {
  const basisLabel = food.weightBasis === "raw" ? "生重" : "熟重";
  if (!food.cookedRawRatio) {
    return `${basisLabel} ${round(grams, 0)}g`;
  }
  if (food.weightBasis === "raw") {
    return `生重 ${round(grams, 0)}g / 熟重 ${round(grams * food.cookedRawRatio, 0)}g`;
  }
  return `熟重 ${round(grams, 0)}g / 生重 ${round(grams / food.cookedRawRatio, 0)}g`;
}

export function normalizeMealRatios(meals: MealPlan[]) {
  const sum = meals.reduce((total, meal) => total + meal.ratio, 0);
  if (sum <= 0) {
    return meals;
  }
  return meals.map((meal) => ({ ...meal, ratio: meal.ratio / sum }));
}
