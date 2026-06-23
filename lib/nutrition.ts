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
  kcal: 1.2,
  protein: 4,
  carbs: 3.6,
  fat: 1
};

const macroKeys: Array<keyof MacroTotals> = ["kcal", "carbs", "protein", "fat"];
const macroRatioKeys: Array<keyof MacroRatio> = ["carbs", "protein", "fat"];
const nutritionKeys: Array<keyof MacroRatio> = ["carbs", "protein", "fat"];
const dailyMacroBand = { deficit: 10, surplus: 5 };
const dailyMacroBandWeights: Record<keyof MacroRatio, number> = {
  carbs: 18,
  protein: 24,
  fat: 12
};

// 张老师五分化碳循环：每周仅 1 天高碳（腿日），其余 6 天低碳。
// 周碳水总量 W×2×7、周脂肪总量 W×0.8×7 在两类碳日间重分配，保持周均不变。
// 高碳日 = 周碳水 30% / 周脂肪 9%（≈4.2g/kg 碳水、0.5g/kg 脂肪），干净饮食可达成。
// 低碳日 = 周碳水 70% 摊 6 天 / 周脂肪 91% 摊 6 天（≈1.63g/kg 碳水、0.85g/kg 脂肪）。
const carbCycleDistribution: Record<CarbDayType, { daysPerWeek: number; carbShare: number; fatShare: number }> = {
  high: { daysPerWeek: 1, carbShare: 0.3, fatShare: 0.09 },
  mid: { daysPerWeek: 6, carbShare: 0.7, fatShare: 0.91 },
  low: { daysPerWeek: 6, carbShare: 0.7, fatShare: 0.91 }
};

const easyFatGainBaseCarbsPerKg = 2;
const easyFatGainBaseFatPerKg = 0.8;
const defaultProteinPerKg = 1.8;
const proteinPerKgRange = { min: 1.6, max: 2.2 };

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

interface MacroRatioRange {
  min: number;
  max: number;
}

interface SolverEntryModel {
  meal: MealPlan;
  entry: MealFoodEntry;
  food: FoodItem;
  min: number;
  max: number;
  portionTarget: number;
  comfortMax: number;
  portionWeight: number;
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

const presenceFloorRatios: Record<FoodCategory, number> = {
  主食: 0.35,
  蔬菜: 0.5,
  水果: 0.4,
  肉类: 0.15,
  补剂: 0.15,
  坚果: 0.3
};

const comfortMaxMultipliers: Record<FoodCategory, number> = {
  主食: 2.1,
  蔬菜: 1.7,
  水果: 1.7,
  肉类: 1.45,
  补剂: 1.15,
  坚果: 1.25
};

const multiFoodHardMaxMultipliers: Record<FoodCategory, number> = {
  主食: 3,
  蔬菜: 2.1,
  水果: 2.1,
  肉类: 1.8,
  补剂: 1,
  坚果: 1.5
};

const cookedMainMultiFoodHardMax = 420;
const mealSoftKcalTolerance = 80;
const mealSoftKcalToleranceRatio = 0.15;
const usefulMealGramLimit = 850;
const hardMealGramLimit = 950;
const breakfastAnimalProteinFloor = 65;
const mainMealAnimalProteinFloor = 90;
const breakfastAnimalProteinShareFloor = 0.1;
const mainMealAnimalProteinShareFloor = 0.12;

const categoryGramWeights: Record<FoodCategory, number> = {
  主食: 0.31,
  蔬菜: 0.34,
  水果: 0.24,
  肉类: 0.27,
  补剂: 0.04,
  坚果: 0.06
};

export const carbCycleMacroSource =
  "张老师五分化碳循环：一周5练（胸/背/腿/肩/手臂）+2休息，仅腿日1天高碳、其余6天低碳；蛋白每日固定W×1.6-2.2g；碳水周总量W×2×7，脂肪周总量W×0.8×7；高碳日=周碳水30%/周脂肪9%（≈4.2g/kg碳水），低碳日=周碳水70%÷6/周脂肪91%÷6（≈1.63g/kg碳水、0.85g/kg脂肪）。";

export const foodPortionSource =
  "分类份量参考中国居民平衡膳食餐盘和健康餐盘法：主餐保留可见蛋白份量，主食、蔬果、蛋白按餐盘结构评分；补剂和坚果按健身常用单次份量设上限。";

export const energyTargetSource =
  "热量目标：当日目标由当前碳日的碳水、蛋白、脂肪按4/4/9 kcal反推；计划缺口用7天周期平均目标热量与维持热量对比。";

export const macroRatioCheckSource =
  "配比检查：按当前体重公式反推的目标供能占比±5个百分点判断碳水、蛋白、脂肪是否贴合。";

export const workoutLabels: Record<WorkoutType, string> = {
  chest: "胸：卧推飞鸟",
  back: "背：引体划船",
  legs: "腿：深蹲硬拉",
  shoulders: "肩：推举侧平举",
  arms: "手臂：弯举臂屈伸",
  rest: "休息日"
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

export const goalMacroRatioRanges: Record<NutritionGoal, Record<keyof MacroRatio, MacroRatioRange>> = {
  cut: {
    carbs: { min: 35, max: 70 },
    protein: { min: 15, max: 35 },
    fat: { min: 15, max: 35 }
  },
  maintain: {
    carbs: { min: 45, max: 65 },
    protein: { min: 10, max: 35 },
    fat: { min: 20, max: 35 }
  },
  bulk: {
    carbs: { min: 45, max: 65 },
    protein: { min: 15, max: 30 },
    fat: { min: 20, max: 35 }
  }
};

export const carbDayMacroRatioRanges: Record<CarbDayType, Record<keyof MacroRatio, MacroRatioRange>> = {
  high: {
    carbs: { min: 55, max: 72 },
    protein: { min: 14, max: 26 },
    fat: { min: 12, max: 24 }
  },
  mid: {
    carbs: { min: 42, max: 58 },
    protein: { min: 15, max: 30 },
    fat: { min: 22, max: 40 }
  },
  low: {
    carbs: { min: 20, max: 40 },
    protein: { min: 14, max: 35 },
    fat: { min: 35, max: 65 }
  }
};

function targetRatioRanges(targetRatio: MacroRatio): Record<keyof MacroRatio, MacroRatioRange> {
  return {
    carbs: { min: clamp(targetRatio.carbs - 5, 0, 100), max: clamp(targetRatio.carbs + 5, 0, 100) },
    protein: { min: clamp(targetRatio.protein - 5, 0, 100), max: clamp(targetRatio.protein + 5, 0, 100) },
    fat: { min: clamp(targetRatio.fat - 5, 0, 100), max: clamp(targetRatio.fat + 5, 0, 100) }
  };
}

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

export function getMacroRatioCheck(
  ratio: MacroRatio,
  targetRatio: MacroRatio,
  goal: NutritionGoal,
  carbDayType?: CarbDayType
) {
  const cycleTolerance = 5;
  const ranges = carbDayType ? targetRatioRanges(targetRatio) : goalMacroRatioRanges[goal];
  const cycleIssues = macroRatioKeys.filter((key) => Math.abs(ratio[key] - targetRatio[key]) > cycleTolerance);
  const goalIssues = macroRatioKeys.filter((key) => ratio[key] < ranges[key].min || ratio[key] > ranges[key].max);

  return {
    cycleAligned: cycleIssues.length === 0,
    goalAligned: goalIssues.length === 0,
    cycleIssues,
    goalIssues,
    cycleTolerance,
    ranges
  };
}

export function calculateMacroKcalPer100g(food: Pick<FoodItem, "carbsPer100g" | "proteinPer100g" | "fatPer100g">) {
  return food.carbsPer100g * 4 + food.proteinPer100g * 4 + food.fatPer100g * 9;
}

export function calculateFoodKcalPer100g(food: Pick<FoodItem, "carbsPer100g" | "proteinPer100g" | "fatPer100g">) {
  return round(calculateMacroKcalPer100g(food), 1);
}

export function getFoodEnergyMismatch(food: Pick<FoodItem, "kcalPer100g" | "carbsPer100g" | "proteinPer100g" | "fatPer100g">) {
  const macroKcalPer100g = calculateMacroKcalPer100g(food);
  const difference = Math.abs(food.kcalPer100g - macroKcalPer100g);
  const warningLimit = Math.max(10, Math.abs(food.kcalPer100g) * 0.08);
  const errorLimit = Math.max(30, Math.abs(food.kcalPer100g) * 0.2);
  const severity = difference <= warningLimit ? "ok" : difference <= errorLimit ? "warn" : "error";

  return {
    severity,
    kcalPer100g: food.kcalPer100g,
    macroKcalPer100g,
    difference,
    warningLimit,
    errorLimit
  };
}

export function clamp(value: number, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.min(Math.max(value, min), max);
}

function isSupplementNamed(food: FoodItem, keyword: string) {
  return food.name.toLowerCase().includes(keyword.toLowerCase());
}

function isProteinSupplement(food: FoodItem) {
  return (
    food.category === "补剂" &&
    (isSupplementNamed(food, "乳清") ||
      isSupplementNamed(food, "蛋白粉") ||
      isSupplementNamed(food, "whey") ||
      isSupplementNamed(food, "protein"))
  );
}

function isCookingOil(food: FoodItem) {
  return (
    food.category === "补剂" &&
    (isSupplementNamed(food, "食用油") || isSupplementNamed(food, "cooking oil") || isSupplementNamed(food, "vegetable oil"))
  );
}

function isSnackMeal(meal?: Pick<MealPlan, "id" | "name">) {
  if (!meal) {
    return false;
  }
  const label = `${meal.id} ${meal.name}`.toLowerCase();
  return label.includes("pre-workout") || label.includes("snack") || label.includes("加餐") || label.includes("训练前");
}

function isStructuredMeal(meal?: Pick<MealPlan, "id" | "name">) {
  return Boolean(meal) && !isSnackMeal(meal);
}

function animalProteinFloorForMeal(meal?: Pick<MealPlan, "id" | "name">) {
  if (!isStructuredMeal(meal)) {
    return 0;
  }
  return meal?.id === "breakfast" ? breakfastAnimalProteinFloor : mainMealAnimalProteinFloor;
}

function animalProteinShareFloorForMeal(meal?: Pick<MealPlan, "id" | "name">) {
  if (!isStructuredMeal(meal)) {
    return 0;
  }
  return meal?.id === "breakfast" ? breakfastAnimalProteinShareFloor : mainMealAnimalProteinShareFloor;
}

function supplementPresenceFloor(food: FoodItem, portionRule: FoodPortionRule) {
  if (isProteinSupplement(food)) {
    return 20;
  }
  if (isCookingOil(food)) {
    return 0;
  }
  if (
    isSupplementNamed(food, "肌酸") ||
    isSupplementNamed(food, "creatine") ||
    isSupplementNamed(food, "鱼油") ||
    isSupplementNamed(food, "fish oil")
  ) {
    return portionRule.defaultGrams;
  }
  return portionRule.defaultGrams * presenceFloorRatios[food.category];
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
    if (isCookingOil(food)) {
      return { defaultGrams: 10, maxGrams: 20, softTargetWeight: 2.4 };
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

export function getProteinPerKg(profile: Pick<UserProfile, "proteinPerKg">) {
  return clamp(profile.proteinPerKg ?? defaultProteinPerKg, proteinPerKgRange.min, proteinPerKgRange.max);
}

function caloriesFromMacros(target: Pick<MacroTotals, "carbs" | "protein" | "fat">) {
  const calories = calculateMacroCalories({ kcal: 0, ...target });
  return calories.carbs + calories.protein + calories.fat;
}

export function calculateCycleAverageTarget(profile: UserProfile): MacroTotals {
  const target = {
    kcal: 0,
    carbs: profile.weightKg * easyFatGainBaseCarbsPerKg,
    protein: profile.weightKg * getProteinPerKg(profile),
    fat: profile.weightKg * easyFatGainBaseFatPerKg
  };

  return {
    ...target,
    kcal: caloriesFromMacros(target)
  };
}

export function calculateCalorieTarget(profile: UserProfile) {
  return calculateCycleAverageTarget(profile).kcal;
}

export function calculatePlannedCalorieDelta(profile: UserProfile) {
  return calculateCalorieTarget(profile) - calculateTdee(profile);
}

export function getCarbDayType(workoutType: WorkoutType): CarbDayType {
  // 张老师五分化：腿日为唯一高碳日（糖原消耗最大），其余训练日与休息日均低碳。
  if (workoutType === "legs") {
    return "high";
  }
  return "low";
}

export function calculateDailyTarget(profile: UserProfile): MacroTotals {
  const carbDayType = getCarbDayType(profile.workoutType);
  const distribution = carbCycleDistribution[carbDayType];
  const weeklyBaseCarbsPerKg = easyFatGainBaseCarbsPerKg * 7;
  const weeklyBaseFatPerKg = easyFatGainBaseFatPerKg * 7;
  const target = {
    kcal: 0,
    carbs: profile.weightKg * ((weeklyBaseCarbsPerKg * distribution.carbShare) / distribution.daysPerWeek),
    protein: profile.weightKg * getProteinPerKg(profile),
    fat: profile.weightKg * ((weeklyBaseFatPerKg * distribution.fatShare) / distribution.daysPerWeek)
  };

  return {
    ...target,
    kcal: caloriesFromMacros(target)
  };
}

export function calculateFoodTotals(food: FoodItem, grams: number): MacroTotals {
  const ratio = grams / 100;
  return {
    kcal: calculateMacroKcalPer100g(food) * ratio,
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

function mealTolerance(target: MacroTotals, key: keyof MacroTotals) {
  if (key === "kcal") {
    return Math.max(mealSoftKcalTolerance, target.kcal * mealSoftKcalToleranceRatio);
  }
  if (key === "carbs") {
    return Math.max(12, target.carbs * 0.18);
  }
  if (key === "protein") {
    return Math.max(8, target.protein * 0.18);
  }
  return Math.max(5, target.fat * 0.2);
}

function mealDeviationScore(total: MacroTotals, target: MacroTotals) {
  const weights: Record<keyof MacroTotals, number> = {
    kcal: 18,
    carbs: 4,
    protein: 5,
    fat: 4
  };

  return macroKeys.reduce((score, key) => {
    const tolerance = mealTolerance(target, key);
    const over = Math.abs(total[key] - target[key]) - tolerance;
    if (over <= 0) {
      return score;
    }
    const ratio = over / tolerance;
    return score + weights[key] * ratio * ratio;
  }, 0);
}

function multiFoodHardMaxFor(food: FoodItem, portionRule: FoodPortionRule) {
  if (isCookingOil(food)) {
    return portionRule.maxGrams;
  }
  const categoryMax = portionRule.defaultGrams * multiFoodHardMaxMultipliers[food.category];
  if (food.category === "主食" && food.weightBasis === "cooked") {
    return Math.min(categoryMax, cookedMainMultiFoodHardMax);
  }
  return categoryMax;
}

function macroFitScore(
  total: MacroTotals,
  target: MacroTotals,
  weights: Record<keyof MacroTotals, number>,
  scaleFloors: MacroTotals
) {
  return macroKeys.reduce((score, key) => {
    const scale = Math.max(Math.abs(target[key]), scaleFloors[key]);
    const ratio = (total[key] - target[key]) / scale;
    return score + weights[key] * ratio * ratio;
  }, 0);
}

function dailyMacroBandScore(total: MacroTotals, target: MacroTotals) {
  return nutritionKeys.reduce((score, key) => {
    const difference = total[key] - target[key];
    const allowed = difference < 0 ? dailyMacroBand.deficit : dailyMacroBand.surplus;
    const excess = Math.abs(difference) - allowed;
    if (excess <= 0) {
      return score;
    }
    const ratio = excess / allowed;
    return score + dailyMacroBandWeights[key] * ratio * ratio;
  }, 0);
}

function isDailyMacroBandAligned(total: MacroTotals, target: MacroTotals) {
  return nutritionKeys.every((key) => {
    const difference = total[key] - target[key];
    return difference >= -dailyMacroBand.deficit && difference <= dailyMacroBand.surplus;
  });
}

function buildMealSolverModels(
  meal: MealPlan,
  foodsById: Map<string, FoodItem>,
  mealTarget: MacroTotals,
  relaxFloors = false
): SolverEntryModel[] {
  if (meal.locked) {
    return [];
  }

  const baseModels = meal.entries.flatMap((entry) => {
    const food = foodsById.get(entry.foodId);
    if (!food || entry.locked) {
      return [];
    }
    const bounds = entryBounds(entry, food, meal);
    const portionRule = getFoodPortionRule(food, meal);
    return [{ entry, food, bounds, portionRule }];
  });

  if (baseModels.length === 0) {
    return [];
  }

  const protectsPresence = baseModels.length > 1;
  const categoryCounts = baseModels.reduce((counts, model) => {
    counts.set(model.food.category, (counts.get(model.food.category) ?? 0) + 1);
    return counts;
  }, new Map<FoodCategory, number>());
  const animalProteinFloors = baseModels.map(({ bounds, food }) =>
    protectsPresence && food.category === "肉类"
      ? clamp(animalProteinFloorForMeal(meal) / Math.max(categoryCounts.get("肉类") ?? 1, 1), bounds.min, bounds.max)
      : bounds.min
  );
  const rawFloors = baseModels.map(({ bounds, food, portionRule }, index) => {
    if (!protectsPresence) {
      return bounds.min;
    }
    const categoryPresenceFloor =
      food.category === "补剂" ? supplementPresenceFloor(food, portionRule) : portionRule.defaultGrams * presenceFloorRatios[food.category];
    return clamp(Math.max(categoryPresenceFloor, animalProteinFloors[index]), bounds.min, bounds.max);
  });
  const floorTotals = baseModels.reduce(
    (total, model, index) => addTotals(total, calculateFoodTotals(model.food, rawFloors[index])),
    zeroTotals
  );
  const floorKcalLimit =
    mealTarget.kcal > 0
      ? Math.max(mealTarget.kcal * (isStructuredMeal(meal) ? 0.78 : 0.55), isStructuredMeal(meal) ? 260 : 120)
      : Number.POSITIVE_INFINITY;
  const floorScale = floorTotals.kcal > floorKcalLimit && floorTotals.kcal > 0 ? floorKcalLimit / floorTotals.kcal : 1;

  return baseModels.map(({ entry, food, bounds, portionRule }, index) => {
    // 宏量优先收尾时放开主食/蔬果/坚果/补剂等“填充类存在感下限”，让优化器能压低它们去贴近全天宏量；
    // 但保留肉类的动物蛋白下限（主餐不出现迷你蛋白份量）与多食材结构上限（避免单一主食压过蔬菜/蛋白）。
    const min = relaxFloors
      ? round(animalProteinFloors[index], 1)
      : round(clamp(bounds.min + (rawFloors[index] - bounds.min) * floorScale, bounds.min, bounds.max), 1);
    const solverMax = protectsPresence
      ? round(clamp(multiFoodHardMaxFor(food, portionRule), min, bounds.max), 1)
      : bounds.max;
    return {
      meal,
      entry,
      food,
      min,
      max: solverMax,
      portionTarget: round(clamp(portionRule.defaultGrams, min, solverMax), 1),
      comfortMax: round(clamp(portionRule.defaultGrams * comfortMaxMultipliers[food.category], min, solverMax), 1),
      portionWeight: portionRule.softTargetWeight
    };
  });
}

function shareRangeScore(share: number, min: number, max: number, weight: number, scale = 0.08) {
  if (share < min) {
    const ratio = (min - share) / scale;
    return weight * ratio * ratio;
  }
  if (share > max) {
    const ratio = (share - max) / scale;
    return weight * ratio * ratio;
  }
  return 0;
}

function mealStructureScore(models: SolverEntryModel[], gramsByEntryId: Record<string, number>) {
  let score = 0;

  for (const model of models) {
    const grams = gramsByEntryId[model.entry.id] ?? model.entry.grams;
    const portionScale = Math.max(model.portionTarget, 25);
    const portionRatio = (grams - model.portionTarget) / portionScale;
    score += model.portionWeight * 0.18 * portionRatio * portionRatio;

    if (models.length > 1 && grams > model.comfortMax) {
      const comfortScale = Math.max(model.comfortMax, 25);
      const overRatio = (grams - model.comfortMax) / comfortScale;
      score += 1.4 * overRatio * overRatio;
    }
  }

  const structureModels = models.filter((model) => model.food.category !== "补剂");
  const totalGrams = structureModels.reduce((sum, model) => sum + (gramsByEntryId[model.entry.id] ?? model.entry.grams), 0);

  if (structureModels.length > 1 && totalGrams > 0) {
    if (totalGrams > usefulMealGramLimit) {
      const overRatio = (totalGrams - usefulMealGramLimit) / 100;
      score += 8 * overRatio * overRatio;
    }
    if (totalGrams > hardMealGramLimit) {
      const overRatio = (totalGrams - hardMealGramLimit) / 100;
      score += 24 * overRatio * overRatio;
    }

    const dominanceLimit = structureModels.length >= 3 ? 0.62 : 0.72;
    for (const model of structureModels) {
      const share = (gramsByEntryId[model.entry.id] ?? model.entry.grams) / totalGrams;
      if (share > dominanceLimit) {
        const overRatio = (share - dominanceLimit) / 0.1;
        score += 4.5 * overRatio * overRatio;
      }
    }

    const categoryTotals = new Map<FoodCategory, number>();
    for (const model of structureModels) {
      categoryTotals.set(
        model.food.category,
        (categoryTotals.get(model.food.category) ?? 0) + (gramsByEntryId[model.entry.id] ?? model.entry.grams)
      );
    }
    const presentCategories = Array.from(categoryTotals.keys()).filter((category) => (categoryTotals.get(category) ?? 0) > 0);
    const targetWeightSum = presentCategories.reduce((sum, category) => sum + categoryGramWeights[category], 0);

    if (presentCategories.length > 1 && targetWeightSum > 0) {
      for (const category of presentCategories) {
        const share = (categoryTotals.get(category) ?? 0) / totalGrams;
        const targetShare = categoryGramWeights[category] / targetWeightSum;
        const diffRatio = (share - targetShare) / 0.35;
        score += 0.8 * diffRatio * diffRatio;
      }
    }

    const meal = structureModels[0]?.meal;
    if (isStructuredMeal(meal)) {
      const mainShare = (categoryTotals.get("主食") ?? 0) / totalGrams;
      const vegetableShare = (categoryTotals.get("蔬菜") ?? 0) / totalGrams;
      const fruitShare = (categoryTotals.get("水果") ?? 0) / totalGrams;
      const animalProteinShare = (categoryTotals.get("肉类") ?? 0) / totalGrams;
      const animalProteinGrams = categoryTotals.get("肉类") ?? 0;
      const animalProteinFloor = animalProteinFloorForMeal(meal);
      const animalProteinShareFloor = animalProteinShareFloorForMeal(meal);

      if (animalProteinGrams > 0 && animalProteinGrams < animalProteinFloor) {
        const underRatio = (animalProteinFloor - animalProteinGrams) / animalProteinFloor;
        score += 40 * underRatio * underRatio;
      }
      if (animalProteinShare > 0 && animalProteinShare < animalProteinShareFloor) {
        const underRatio = (animalProteinShareFloor - animalProteinShare) / 0.05;
        score += 18 * underRatio * underRatio;
      }

      if (mainShare > 0) {
        score += shareRangeScore(mainShare, 0.18, 0.5, 6);
      }
      if (vegetableShare > 0) {
        score += shareRangeScore(vegetableShare, 0.18, 0.52, 5);
      }
      if (fruitShare > 0 && meal?.id !== "breakfast") {
        score += shareRangeScore(fruitShare, 0.08, 0.36, 3);
      }
      if (animalProteinShare > 0) {
        score += shareRangeScore(animalProteinShare, animalProteinShareFloor, 0.34, 12);
      }
    }
  }

  return score;
}

function candidateGrams(model: SolverEntryModel, current: number, step: number) {
  return Array.from(
    new Set(
      [current - step, current + step, model.min, model.portionTarget, model.comfortMax, model.max].map((value) =>
        round(clamp(value, model.min, model.max), 1)
      )
    )
  );
}

function optimizeSolverModels(
  models: SolverEntryModel[],
  readGrams: (model: SolverEntryModel) => number,
  writeGrams: (model: SolverEntryModel, grams: number) => void,
  scoreState: () => number
) {
  const steps = [160, 80, 40, 20, 10, 5, 1];
  let bestScore = scoreState();

  for (const step of steps) {
    let improved = true;
    let pass = 0;

    while (improved && pass < 8) {
      improved = false;
      pass += 1;

      for (const model of models) {
        let current = readGrams(model);
        for (const candidate of candidateGrams(model, current, step)) {
          if (Math.abs(candidate - current) < 0.05) {
            continue;
          }

          writeGrams(model, candidate);
          const score = scoreState();
          if (score + 1e-9 < bestScore) {
            bestScore = score;
            current = candidate;
            improved = true;
          } else {
            writeGrams(model, current);
          }
        }
      }
    }
  }
}

function solveMealEntries(
  meal: MealPlan,
  mealTarget: MacroTotals,
  foodsById: Map<string, FoodItem>
) {
  const recommended = Object.fromEntries(meal.entries.map((entry) => [entry.id, entry.grams]));
  const models = buildMealSolverModels(meal, foodsById, mealTarget);

  if (models.length === 0) {
    return recommended;
  }

  for (const model of models) {
    recommended[model.entry.id] = round(clamp(recommended[model.entry.id] ?? model.entry.grams, model.min, model.max), 1);
  }

  const scoreState = () =>
    macroFitScore(calculateTotalsFromEntries(meal.entries, recommended, foodsById), mealTarget, macroWeights, {
      kcal: 80,
      carbs: 8,
      protein: 8,
      fat: 6
    }) *
      12 +
    mealStructureScore(models, recommended);

  optimizeSolverModels(
    models,
    (model) => recommended[model.entry.id] ?? model.entry.grams,
    (model, grams) => {
      recommended[model.entry.id] = grams;
    },
    scoreState
  );

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

  const refined = refineDailyRecommendations(meals, dailyTarget, mealTargetsById, solvedEntriesByMealId, recommendedTotals, foodsById);
  solvedEntriesByMealId = refined.solvedEntriesByMealId;
  recommendedTotals = refined.recommendedTotals;

  return { solvedEntriesByMealId, recommendedTotals };
}

function refineDailyRecommendations(
  meals: MealPlan[],
  dailyTarget: MacroTotals,
  mealTargetsById: Map<string, MacroTotals>,
  initialEntriesByMealId: Map<string, Record<string, number>>,
  initialTotals: MacroTotals,
  foodsById: Map<string, FoodItem>
) {
  const solvedEntriesByMealId = new Map(
    Array.from(initialEntriesByMealId.entries()).map(([mealId, entries]) => [mealId, { ...entries }])
  );
  const modelsByMealId = new Map(
    meals.map((meal) => [meal.id, buildMealSolverModels(meal, foodsById, mealTargetsById.get(meal.id) ?? zeroTotals)])
  );
  const models = Array.from(modelsByMealId.values()).flat();

  if (models.length === 0) {
    return { solvedEntriesByMealId, recommendedTotals: initialTotals };
  }

  for (const model of models) {
    const mealEntries = solvedEntriesByMealId.get(model.meal.id);
    if (mealEntries) {
      mealEntries[model.entry.id] = round(clamp(mealEntries[model.entry.id] ?? model.entry.grams, model.min, model.max), 1);
    }
  }

  const calculateRecommendedTotals = () =>
    meals.reduce((total, meal) => {
      const entries = solvedEntriesByMealId.get(meal.id) ?? Object.fromEntries(meal.entries.map((entry) => [entry.id, entry.grams]));
      return addTotals(total, calculateTotalsFromEntries(meal.entries, entries, foodsById));
    }, zeroTotals);

  const scoreState = () => {
    const dailyTotals = calculateRecommendedTotals();
    let score =
      macroFitScore(dailyTotals, dailyTarget, dailyFitWeights, {
        kcal: 120,
        carbs: 12,
        protein: 10,
        fat: 8
      }) *
        220 +
      dailyMacroBandScore(dailyTotals, dailyTarget) * 360;

    for (const meal of meals) {
      const mealEntries = solvedEntriesByMealId.get(meal.id) ?? Object.fromEntries(meal.entries.map((entry) => [entry.id, entry.grams]));
      const mealTarget = mealTargetsById.get(meal.id) ?? zeroTotals;
      const mealTotals = calculateTotalsFromEntries(meal.entries, mealEntries, foodsById);
      score +=
        macroFitScore(mealTotals, mealTarget, macroWeights, {
          kcal: 80,
          carbs: 8,
          protein: 8,
          fat: 6
        }) * 0.3;
      score += mealDeviationScore(mealTotals, mealTarget) * 18;
      score += mealStructureScore(modelsByMealId.get(meal.id) ?? [], mealEntries);
    }

    return score;
  };

  optimizeSolverModels(
    models,
    (model) => solvedEntriesByMealId.get(model.meal.id)?.[model.entry.id] ?? model.entry.grams,
    (model, grams) => {
      const mealEntries = solvedEntriesByMealId.get(model.meal.id);
      if (mealEntries) {
        mealEntries[model.entry.id] = grams;
      }
    },
    scoreState
  );

  // 宏量优先收尾：当“餐盘结构解”仍无法把全天碳水/蛋白/脂肪压进容忍带时，
  // 放开存在感下限（只守用户锁定与显式上下限），以贴近全天宏量为唯一目标再优化一轮，
  // 让推荐尽量逼近食材在物理上能达到的最接近点。仅在能改善全天宏量分数时采纳，绝不回退。
  if (!isDailyMacroBandAligned(calculateRecommendedTotals(), dailyTarget)) {
    const macroModelsByMealId = new Map(
      meals.map((meal) => [meal.id, buildMealSolverModels(meal, foodsById, mealTargetsById.get(meal.id) ?? zeroTotals, true)])
    );
    const macroModels = Array.from(macroModelsByMealId.values()).flat();

    if (macroModels.length > 0) {
      for (const model of macroModels) {
        const mealEntries = solvedEntriesByMealId.get(model.meal.id);
        if (mealEntries) {
          mealEntries[model.entry.id] = round(clamp(mealEntries[model.entry.id] ?? model.entry.grams, model.min, model.max), 1);
        }
      }

      const macroScoreState = () => {
        const dailyTotals = calculateRecommendedTotals();
        let score =
          dailyMacroBandScore(dailyTotals, dailyTarget) * 1000 +
          macroFitScore(dailyTotals, dailyTarget, dailyFitWeights, { kcal: 120, carbs: 12, protein: 10, fat: 8 }) * 80;
        // 轻量结构项仅用于打破并列，优先保留更像“餐盘”的克重，不与宏量目标抗衡。
        for (const meal of meals) {
          const mealEntries = solvedEntriesByMealId.get(meal.id) ?? Object.fromEntries(meal.entries.map((e) => [e.id, e.grams]));
          score += mealStructureScore(macroModelsByMealId.get(meal.id) ?? [], mealEntries) * 0.05;
        }
        return score;
      };

      optimizeSolverModels(
        macroModels,
        (model) => solvedEntriesByMealId.get(model.meal.id)?.[model.entry.id] ?? model.entry.grams,
        (model, grams) => {
          const mealEntries = solvedEntriesByMealId.get(model.meal.id);
          if (mealEntries) {
            mealEntries[model.entry.id] = grams;
          }
        },
        macroScoreState
      );
    }
  }

  const recommendedTotals = calculateRecommendedTotals();

  return { solvedEntriesByMealId, recommendedTotals };
}

function buildDynamicMealTargets(
  meals: MealPlan[],
  dailyTarget: MacroTotals,
  solvedEntriesByMealId: Map<string, Record<string, number>>,
  fallbackTargetsByMealId: Map<string, MacroTotals>,
  foodsById: Map<string, FoodItem>
) {
  const recommendedByMeal = new Map(
    meals.map((meal) => {
      const entries = solvedEntriesByMealId.get(meal.id) ?? Object.fromEntries(meal.entries.map((entry) => [entry.id, entry.grams]));
      return [meal.id, calculateTotalsFromEntries(meal.entries, entries, foodsById)];
    })
  );
  const recommendedTotals = meals.reduce(
    (total, meal) => addTotals(total, recommendedByMeal.get(meal.id) ?? zeroTotals),
    zeroTotals
  );

  return new Map(
    meals.map((meal) => {
      const recommended = recommendedByMeal.get(meal.id) ?? zeroTotals;
      const fallback = fallbackTargetsByMealId.get(meal.id) ?? zeroTotals;
      const targetForKey = (key: keyof MacroTotals) => {
        const total = recommendedTotals[key];
        if (total <= 0 || dailyTarget[key] <= 0) {
          return fallback[key];
        }
        return dailyTarget[key] * (recommended[key] / total);
      };
      return [
        meal.id,
        {
          kcal: targetForKey("kcal"),
          carbs: targetForKey("carbs"),
          protein: targetForKey("protein"),
          fat: targetForKey("fat")
        }
      ];
    })
  );
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

function lockedMealDeviationMessage(meal: MealPlan, deficit: MacroTotals) {
  const direction = deficit.kcal > 0 ? "仍亏" : "仍盈";
  return `${meal.name} 有锁定项，推荐后${direction} ${round(Math.abs(deficit.kcal), 0)} kcal；已保留该差额，避免把缺口强行分配给其他餐`;
}

// 全天宏量未进入容忍带时的可执行提示：逐项标出盈/亏方向，并针对“脂肪超标但碳水/蛋白不足”这类
// 食材脂肪密度过高的常见死结给出换食材/调目标的具体建议，而不是泛泛地让用户自己排查。
function dailyBandConflictMessage(remaining: MacroTotals) {
  const labels = { carbs: "碳水", protein: "蛋白", fat: "脂肪" } as const;
  const parts: string[] = [];
  let fatSurplus = false;
  let macroDeficit = false;
  for (const key of macroRatioKeys) {
    const diff = remaining[key]; // 目标 - 推荐：>0 为亏，<0 为盈
    if (diff > dailyMacroBand.deficit) {
      parts.push(`${labels[key]}亏${round(diff)}g`);
      if (key !== "fat") macroDeficit = true;
    } else if (diff < -dailyMacroBand.surplus) {
      parts.push(`${labels[key]}盈${round(-diff)}g`);
      if (key === "fat") fatSurplus = true;
    }
  }
  const hint =
    fatSurplus && macroDeficit
      ? "原因是当前食材脂肪密度偏高：补足碳水/蛋白时脂肪必然超目标。可换更瘦的蛋白（鸡胸/虾/白鱼/低脂乳清）、减少蛋黄/坚果/食用油等高脂食材，或上调脂肪目标。"
      : "可调整食材种类、各项克重上下限或解除锁定后重试。";
  return `全天推荐已尽量贴近，但仍超出克数容忍带：${parts.join("、")}。${hint}`;
}

export function buildNutritionResult(profile: UserProfile, meals: MealPlan[], foods: FoodItem[]): NutritionResult {
  const foodsById = new Map(foods.map((food) => [food.id, food]));
  const cycleAverageTarget = calculateCycleAverageTarget(profile);
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
  const dynamicMealTargetsById = buildDynamicMealTargets(meals, dailyTarget, solvedEntriesByMealId, mealTargetsById, foodsById);

  if (!isDailyMacroBandAligned(recommendedTotals, dailyTarget)) {
    conflicts.push(dailyBandConflictMessage(subtractTotals(dailyTarget, recommendedTotals)));
  }

  const mealRecommendations = meals.map((meal) => {
    const mealActual = calculateMealTotals(meal, foodsById);
    const mealTarget = dynamicMealTargetsById.get(meal.id) ?? mealTargetsById.get(meal.id) ?? mealActual;
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

    if ((meal.locked || meal.entries.some((entry) => entry.locked)) && Math.abs(deficit.kcal) > 120) {
      conflicts.push(lockedMealDeviationMessage(meal, deficit));
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
    cycleAverageTarget,
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
