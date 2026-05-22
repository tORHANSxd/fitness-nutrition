export const foodCategories = ["主食", "蔬菜", "水果", "肉类", "补剂", "坚果"] as const;

export type FoodCategory = (typeof foodCategories)[number];
export type WeightBasis = "raw" | "cooked";
export type Sex = "male" | "female";
export type WorkoutType = "legs" | "back" | "chest" | "shoulders" | "arms" | "rest";
export type CarbDayType = "high" | "mid" | "low";
export type TrainingTime = "morning" | "afternoon" | "evening";
export type NutritionGoal = "cut" | "maintain" | "bulk";
export type ViewName = "planner" | "foods" | "history" | "login";

export interface MacroTotals {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
}

export interface MacroRatio {
  carbs: number;
  protein: number;
  fat: number;
}

export interface UserProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityFactor: number;
  exerciseKcal: number;
  goalType?: NutritionGoal;
  weeklyWeightChangePct?: number;
  proteinPerKg: number;
  bodyTypeFactor: number;
  workoutType: WorkoutType;
  trainingTime: TrainingTime;
  planDate: string;
}

export interface FoodItem {
  id: string;
  userId?: string | null;
  isUserOverride?: boolean;
  name: string;
  category: FoodCategory;
  kcalPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  proteinPer100g: number;
  weightBasis: WeightBasis;
  cookedRawRatio?: number | null;
  source: "public" | "user";
}

export interface MealFoodEntry {
  id: string;
  foodId: string;
  grams: number;
  locked: boolean;
  minGrams?: number | null;
  maxGrams?: number | null;
}

export interface MealPlan {
  id: string;
  name: string;
  ratio: number;
  locked: boolean;
  entries: MealFoodEntry[];
}

export interface MealRecommendation {
  mealId: string;
  target: MacroTotals;
  actual: MacroTotals;
  actualDeficit: MacroTotals;
  targetRatio: MacroRatio;
  actualRatio: MacroRatio;
  recommendedEntries: Record<string, number>;
  deficit: MacroTotals;
}

export interface NutritionResult {
  bmr: number;
  tdee: number;
  plannedCalorieDelta: number;
  carbDayType: CarbDayType;
  dailyTarget: MacroTotals;
  actualTotals: MacroTotals;
  targetRatio: MacroRatio;
  actualRatio: MacroRatio;
  remaining: MacroTotals;
  mealRecommendations: MealRecommendation[];
  conflicts: string[];
}

export interface SavedPlan {
  id: string;
  planDate: string;
  profile: UserProfile;
  meals: MealPlan[];
  result: NutritionResult;
  createdAt: string;
}

export type FoodFormState = Omit<FoodItem, "id" | "source" | "userId">;
