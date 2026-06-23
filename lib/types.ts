export const foodCategories = ["主食", "蔬菜", "水果", "肉类", "补剂", "坚果"] as const;

export type FoodCategory = (typeof foodCategories)[number];
export type WeightBasis = "raw" | "cooked";
export type Sex = "male" | "female";
export type WorkoutType = "chest" | "back" | "legs" | "shoulders" | "arms" | "rest";
export type CarbDayType = "high" | "mid" | "low";
export type TrainingTime = "morning" | "afternoon" | "evening";
export type NutritionGoal = "cut" | "maintain" | "bulk";
export type ViewName = "overview" | "planner" | "schedule" | "training" | "templates" | "foods" | "history" | "login";

export type MuscleGroup =
  | "chest"
  | "back"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "calves"
  | "abs";
export type TrainingSplit = "ppl" | "upperLower" | "fullBody";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type OneRmFormula = "epley" | "brzycki";

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

/** 单组训练记录：逐组的重量×次数×RIR，是计算的最小单位。 */
export interface WorkoutSet {
  id: string;
  exercise: string;
  muscleGroup: MuscleGroup;
  weightKg: number;
  reps: number;
  /** Reps In Reserve 剩余次数；null = 未记录（不参与 RIR 相关统计）。 */
  rir: number | null;
  /** 热身组不计入有效训练量。 */
  isWarmup: boolean;
}

/** 一次训练（一天一条）。逐组数据放在 sets 里以 jsonb 存入 Supabase。 */
export interface WorkoutSession {
  id: string;
  sessionDate: string;
  splitLabel: string;
  carbDayType: CarbDayType;
  bodyweightKg?: number | null;
  /** 主观恢复 1–5（睡眠/精力/酸痛综合）。 */
  recovery?: number | null;
  note?: string;
  sets: WorkoutSet[];
  createdAt: string;
}

/** 训练量地标（每肌群每周硬组数），来自 RP / Schoenfeld。 */
export interface VolumeLandmark {
  mv: number;
  mev: number;
  mav: number;
  mrv: number;
}

export interface ProgramExercise {
  exercise: string;
  muscleGroup: MuscleGroup;
  sets: number;
  repRange: [number, number];
  targetRir: number;
}

export interface ProgramDay {
  dayLabel: string;
  splitLabel: string;
  muscleGroups: MuscleGroup[];
  carbDay: CarbDayType;
  exercises: ProgramExercise[];
}

export interface ProgramTemplate {
  id: TrainingSplit;
  name: string;
  summary: string;
  daysPerWeek: number;
  days: ProgramDay[];
}
