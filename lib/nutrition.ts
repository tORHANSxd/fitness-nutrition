import type {
  CarbDayType,
  FoodCategory,
  FoodItem,
  MacroRatio,
  MacroTotals,
  MealFoodEntry,
  MealPlan,
  NutritionResult,
  NutritionGoal,
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

const dailyFitWeights: Record<keyof MacroTotals, number> = {
  kcal: 1,
  protein: 2.5,
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

const kcalPerKgWeight = 7700;

const goalDefaults: Record<NutritionGoal, number> = {
  cut: 0.5,
  maintain: 0,
  bulk: 0.25
};

const goalRanges: Record<NutritionGoal, { min: number; max: number }> = {
  cut: { min: 0.25, max: 1 },
  maintain: { min: 0, max: 0 },
  bulk: { min: 0.1, max: 0.5 }
};

interface FoodPortionRule {
  defaultGrams: number;
  maxGrams: number;
  softTargetWeight: number;
}

const cookedMainMax = 360;
const rawMainMax = 120;

const defaultPortionRules: Record<FoodCategory, FoodPortionRule> = {
  主食: { defaultGrams: 180, maxGrams: cookedMainMax, softTargetWeight: 0.28 },
  蔬菜: { defaultGrams: 200, maxGrams: 420, softTargetWeight: 0.34 },
  水果: { defaultGrams: 120, maxGrams: 250, softTargetWeight: 0.34 },
  肉类: { defaultGrams: 150, maxGrams: 260, softTargetWeight: 0.26 },
  补剂: { defaultGrams: 30, maxGrams: 40, softTargetWeight: 1.3 },
  坚果: { defaultGrams: 20, maxGrams: 35, softTargetWeight: 1.1 }
};

export const carbCycleMacroSource =
  "凯圣王碳循环：周碳水高/中/低分配为50%/35%/15%，周脂肪高/中/低分配为15%/35%/50%，蛋白每日稳定。";

export const foodPortionSource =
  "分类份量参考中国居民平衡膳食餐盘：蔬菜约34%-36%、谷薯类约26%-28%、水果约20%-25%、动物性食物约13%-17%；补剂和坚果按健身常用单次份量设上限。";

export const energyTargetSource =
  "热量目标：先估算维持热量，再按每周体重变化率设置目标；减脂默认0.5%体重/周，增肌默认0.25%体重/周。";

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

export const goalLabels: Record<NutritionGoal, string> = {
  cut: "减脂",
  maintain: "维持",
  bulk: "增肌"
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

function isSupplementNamed(food: FoodItem, keyword: string) {
  return food.name.toLowerCase().includes(keyword.toLowerCase());
}

export function getFoodPortionRule(food: FoodItem, meal?: Pick<MealPlan, "id" | "name">): FoodPortionRule {
  const base = defaultPortionRules[food.category];
  if (food.category === "主食" && food.weightBasis === "raw") {
    return { ...base, defaultGrams: 60, maxGrams: rawMainMax };
  }
  if (food.category === "水果" && meal?.id === "pre-workout") {
    return { ...base, defaultGrams: 120, maxGrams: 220 };
  }
  if (food.category === "肉类" && food.weightBasis === "raw") {
    return { ...base, defaultGrams: 160, maxGrams: 280 };
  }
  if (food.category === "补剂") {
    if (isSupplementNamed(food, "肌酸") || isSupplementNamed(food, "creatine")) {
      return { defaultGrams: 5, maxGrams: 5, softTargetWeight: 2.4 };
    }
    if (isSupplementNamed(food, "鱼油") || isSupplementNamed(food, "fish oil")) {
      return { defaultGrams: 2, maxGrams: 5, softTargetWeight: 2.4 };
    }
    if (isSupplementNamed(food, "电解质") || isSupplementNamed(food, "electrolyte")) {
      return { defaultGrams: 8, maxGrams: 20, softTargetWeight: 1.8 };
    }
  }
  return base;
}

export function getDefaultMealEntrySettings(food: FoodItem, meal?: Pick<MealPlan, "id" | "name">) {
  const rule = getFoodPortionRule(food, meal);
  return {
    grams: rule.defaultGrams,
    minGrams: 0,
    maxGrams: rule.maxGrams
  };
}

export function calculateBmr(profile: Pick<UserProfile, "sex" | "age" | "heightCm" | "weightKg">) {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  return profile.sex === "male" ? base + 5 : base - 161;
}

export function calculateTdee(profile: UserProfile) {
  return calculateBmr(profile) * profile.activityFactor + profile.exerciseKcal;
}

export function getNutritionGoal(profile: Pick<UserProfile, "goalType">): NutritionGoal {
  return profile.goalType ?? "cut";
}

export function getWeeklyWeightChangePct(profile: Pick<UserProfile, "goalType" | "weeklyWeightChangePct">) {
  const goal = getNutritionGoal(profile);
  const range = goalRanges[goal];
  const rawValue = profile.weeklyWeightChangePct ?? goalDefaults[goal];
  return clamp(rawValue, range.min, range.max);
}

function minimumTargetCalories(profile: Pick<UserProfile, "sex">) {
  return profile.sex === "female" ? 1200 : 1500;
}

export function calculateCalorieTarget(profile: UserProfile) {
  const tdee = calculateTdee(profile);
  const goal = getNutritionGoal(profile);
  const weeklyChangePct = getWeeklyWeightChangePct(profile);
  const dailyEnergyDelta = (profile.weightKg * (weeklyChangePct / 100) * kcalPerKgWeight) / 7;

  if (goal === "maintain") {
    return tdee;
  }

  if (goal === "bulk") {
    const surplus = Math.min(dailyEnergyDelta, 500, tdee * 0.15);
    return tdee + surplus;
  }

  const deficit = Math.min(dailyEnergyDelta, 1000, tdee * 0.25);
  return Math.max(tdee - deficit, minimumTargetCalories(profile));
}

export function calculatePlannedCalorieDelta(profile: UserProfile) {
  return calculateCalorieTarget(profile) - calculateTdee(profile);
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
  const targetCalories = calculateCalorieTarget(profile);
  const protein = profile.weightKg * profile.proteinPerKg;
  const weeklyCarbs = profile.weightKg * profile.bodyTypeFactor * 7;
  const fatParameter = 0.8 + (profile.bodyTypeFactor - 2) * 0.3;
  const weeklyFat = profile.weightKg * fatParameter * 7;
  const rawCarbs = weeklyCarbs * carbRatios[carbDayType];
  const rawFat = weeklyFat * fatRatios[carbDayType];
  const caloriesAfterProtein = Math.max(targetCalories - protein * 4, 0);
  const rawCarbFatCalories = rawCarbs * 4 + rawFat * 9;
  const scale = rawCarbFatCalories > 0 ? caloriesAfterProtein / rawCarbFatCalories : 1;

  return {
    kcal: targetCalories,
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

function entryBounds(entry: MealFoodEntry, food?: FoodItem, meal?: Pick<MealPlan, "id" | "name">) {
  const min = Math.max(entry.minGrams ?? 0, 0);
  const defaultMax = food ? getFoodPortionRule(food, meal).maxGrams : Number.POSITIVE_INFINITY;
  const requestedMax = entry.maxGrams == null ? defaultMax : entry.maxGrams;
  const max = Math.max(requestedMax, min);
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
    const food = foodsById.get(entry.foodId);
    const { min, max } = entryBounds(entry, food, meal);
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
      const { min, max } = entryBounds(entry, food, meal);
      const portionRule = getFoodPortionRule(food, meal);
      const portionTarget = clamp(portionRule.defaultGrams, min, max);
      const portionScale = Math.max(portionTarget, 25);
      numerator += portionRule.softTargetWeight * (currentGrams - portionTarget) / (portionScale * portionScale);
      denominator += portionRule.softTargetWeight / (portionScale * portionScale);
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

function buildMealTargets(
  meals: MealPlan[],
  remainingAfterLockedMeals: MacroTotals,
  unlockedRatioSum: number,
  foodsById: Map<string, FoodItem>
) {
  const targetsByMealId = new Map<string, MacroTotals>();
  for (const meal of meals) {
    const mealActual = calculateMealTotals(meal, foodsById);
    targetsByMealId.set(
      meal.id,
      meal.locked
        ? mealActual
        : scaleTotals(
            {
              kcal: Math.max(remainingAfterLockedMeals.kcal, 0),
              carbs: Math.max(remainingAfterLockedMeals.carbs, 0),
              protein: Math.max(remainingAfterLockedMeals.protein, 0),
              fat: Math.max(remainingAfterLockedMeals.fat, 0)
            },
            unlockedRatioSum > 0 ? meal.ratio / unlockedRatioSum : 0
          )
    );
  }
  return targetsByMealId;
}

function solveAllMealRecommendations(
  meals: MealPlan[],
  dailyTarget: MacroTotals,
  mealTargetsById: Map<string, MacroTotals>,
  foodsById: Map<string, FoodItem>
) {
  let solvedEntriesByMealId = new Map<string, Record<string, number>>();
  let recommendedTotals = zeroTotals;

  for (const meal of meals) {
    const target = mealTargetsById.get(meal.id) ?? zeroTotals;
    const solvedEntries = solveMealEntries(meal, target, foodsById);
    solvedEntriesByMealId.set(meal.id, solvedEntries);
    recommendedTotals = addTotals(
      recommendedTotals,
      calculateTotalsFromEntries(meal.entries, solvedEntries, foodsById)
    );
  }

  const refined = refineDailyRecommendations(meals, dailyTarget, solvedEntriesByMealId, recommendedTotals, foodsById);
  solvedEntriesByMealId = refined.solvedEntriesByMealId;
  recommendedTotals = refined.recommendedTotals;

  return { solvedEntriesByMealId, recommendedTotals };
}

function refineDailyRecommendations(
  meals: MealPlan[],
  dailyTarget: MacroTotals,
  initialEntriesByMealId: Map<string, Record<string, number>>,
  initialTotals: MacroTotals,
  foodsById: Map<string, FoodItem>
) {
  const solvedEntriesByMealId = new Map(
    Array.from(initialEntriesByMealId.entries()).map(([mealId, entries]) => [mealId, { ...entries }])
  );
  let recommendedTotals = initialTotals;
  const adjustableEntries = meals.flatMap((meal) =>
    meal.locked
      ? []
      : meal.entries.flatMap((entry) => {
          const food = foodsById.get(entry.foodId);
          return food && !entry.locked ? [{ meal, entry, food }] : [];
        })
  );

  if (adjustableEntries.length === 0) {
    return { solvedEntriesByMealId, recommendedTotals };
  }

  for (let iteration = 0; iteration < 80; iteration += 1) {
    let maxDelta = 0;

    for (const { meal, entry, food } of adjustableEntries) {
      const mealEntries = solvedEntriesByMealId.get(meal.id);
      if (!mealEntries) {
        continue;
      }

      const currentGrams = mealEntries[entry.id] ?? entry.grams;
      const { min, max } = entryBounds(entry, food, meal);
      const vector: MacroTotals = {
        kcal: food.kcalPer100g / 100,
        carbs: food.carbsPer100g / 100,
        protein: food.proteinPer100g / 100,
        fat: food.fatPer100g / 100
      };
      const diff = subtractTotals(recommendedTotals, dailyTarget);
      let numerator = 0;
      let denominator = 0;

      for (const key of Object.keys(vector) as Array<keyof MacroTotals>) {
        const scale = Math.max(Math.abs(dailyTarget[key]), key === "kcal" ? 100 : 10);
        numerator += dailyFitWeights[key] * diff[key] * vector[key] / (scale * scale);
        denominator += dailyFitWeights[key] * vector[key] * vector[key] / (scale * scale);
      }

      const portionRule = getFoodPortionRule(food, meal);
      const portionTarget = clamp(portionRule.defaultGrams, min, max);
      const portionScale = Math.max(portionTarget, 25);
      const portionWeight = portionRule.softTargetWeight * 0.001;
      numerator += portionWeight * (currentGrams - portionTarget) / (portionScale * portionScale);
      denominator += portionWeight / (portionScale * portionScale);

      if (denominator === 0) {
        continue;
      }

      const nextGrams = round(clamp(currentGrams - numerator / denominator, min, max), 1);
      const delta = nextGrams - currentGrams;
      if (Math.abs(delta) < 0.05) {
        continue;
      }

      mealEntries[entry.id] = nextGrams;
      recommendedTotals = addTotals(recommendedTotals, scaleTotals(vector, delta));
      maxDelta = Math.max(maxDelta, Math.abs(delta));
    }

    if (maxDelta < 0.1) {
      break;
    }
  }

  return { solvedEntriesByMealId, recommendedTotals };
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
  const tdee = calculateTdee(profile);
  const plannedCalorieDelta = calculatePlannedCalorieDelta(profile);
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

  const plannedDeficit = Math.max(-plannedCalorieDelta, 0);
  const actualDeficitFromMaintenance = tdee - actualTotals.kcal;
  if (plannedDeficit > 0 && actualTotals.kcal > 0 && actualDeficitFromMaintenance > plannedDeficit + 250) {
    conflicts.push(
      `当前实际热量缺口过大：${round(actualDeficitFromMaintenance, 0)} kcal，计划缺口 ${round(plannedDeficit, 0)} kcal`
    );
  }

  const mealTargetsById = buildMealTargets(meals, remainingAfterLockedMeals, unlockedRatioSum, foodsById);
  const { solvedEntriesByMealId, recommendedTotals } = solveAllMealRecommendations(
    meals,
    dailyTarget,
    mealTargetsById,
    foodsById
  );

  const mealRecommendations = meals.map((meal) => {
    const mealActual = calculateMealTotals(meal, foodsById);
    const mealTarget = mealTargetsById.get(meal.id) ?? mealActual;
    const recommendedEntries = solvedEntriesByMealId.get(meal.id) ?? Object.fromEntries(meal.entries.map((entry) => [entry.id, entry.grams]));
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
    tdee,
    plannedCalorieDelta,
    carbDayType: getCarbDayType(profile.workoutType),
    dailyTarget,
    actualTotals,
    recommendedTotals,
    targetRatio: calculateMacroRatio(dailyTarget),
    actualRatio: calculateMacroRatio(actualTotals),
    remaining: subtractTotals(dailyTarget, actualTotals),
    recommendedRemaining: subtractTotals(dailyTarget, recommendedTotals),
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
