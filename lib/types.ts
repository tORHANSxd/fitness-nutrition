export const foodCategories = ["主食", "蔬菜", "水果", "肉类", "补剂", "坚果"] as const;

export type FoodCategory = (typeof foodCategories)[number];
export type WeightBasis = "raw" | "cooked";
export type Sex = "male" | "female";
export type WorkoutType = "chest" | "back" | "legs" | "rest";
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
  proteinPerKg?: number;
  goalType?: NutritionGoal;
  weeklyWeightChangePct?: number;
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
  /** 净碳水/可利用碳水，不包含不参与供能的碳水组分。 */
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
  cycleAverageTarget: MacroTotals;
  dailyTarget: MacroTotals;
  actualTotals: MacroTotals;
  recommendedTotals: MacroTotals;
  targetRatio: MacroRatio;
  actualRatio: MacroRatio;
  remaining: MacroTotals;
  recommendedRemaining: MacroTotals;
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

export interface PlannerDraft {
  profile: UserProfile;
  meals: MealPlan[];
  updatedAt: string;
}

export interface MealTemplate {
  id: string;
  name: string;
  sourceMealName: string;
  mealRatio: number;
  mealLocked: boolean;
  entries: MealFoodEntry[];
  createdAt: string;
}

export interface DayTemplate {
  id: string;
  name: string;
  meals: MealPlan[];
  createdAt: string;
}

export interface PlannerTemplates {
  mealTemplates: MealTemplate[];
  dayTemplates: DayTemplate[];
}

export type FoodFormState = Omit<FoodItem, "id" | "source" | "userId">;
