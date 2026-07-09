export const foodCategories = ["主食", "蔬菜", "水果", "肉类", "补剂", "坚果", "食物配料"] as const;

export type FoodCategory = (typeof foodCategories)[number];
export type WeightBasis = "raw" | "cooked";
export type Sex = "male" | "female";
export type WorkoutType = "chest" | "back" | "legs" | "shoulders" | "arms" | "rest";
export type CarbDayType = "high" | "mid" | "low";
export type TrainingTime = "morning" | "afternoon" | "evening" | "rest";
/** 计划页「碳循环日」下拉可选项：张老师五分化只有高碳(腿日)与低碳。 */
export const plannerCarbDayOptions = ["high", "low"] as const;
export type NutritionGoal = "cut" | "maintain" | "bulk";
export type ViewName = "overview" | "planner" | "meals" | "schedule" | "training" | "body" | "templates" | "foods" | "history" | "login";

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
export type TrainingSplit = "ppl" | "pplLumbarSafe" | "upperLower" | "fullBody";
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
  /** 减脂热量缺口（kcal/天）：当日目标热量 = TDEE − 该值。缺省 500（≈每周减0.5kg）。 */
  calorieDeficit?: number;
  goalType?: NutritionGoal;
  weeklyWeightChangePct?: number;
  /** 当日碳循环日（主字段，计划页直接选高碳/低碳）。休息日强制低碳。 */
  carbDayType?: CarbDayType;
  /** 旧数据遗留字段：早期按训练部位派生碳日，现仅用于兼容历史草稿/计划的回退解析。 */
  workoutType?: WorkoutType;
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

/** 分餐里临时自定义食物的营养定义（每 100g）：三大营养素自由填，热量由 4/4/9 自动推导。 */
export interface CustomFoodDraft {
  name: string;
  category: FoodCategory;
  carbsPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
}

export interface MealFoodEntry {
  id: string;
  foodId: string;
  grams: number;
  locked: boolean;
  minGrams?: number | null;
  maxGrams?: number | null;
  /** 临时自定义食物：营养定义内嵌在条目里，随计划/草稿一起保存，不进食物库。 */
  customFood?: CustomFoodDraft;
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

/** 模板里的食物引用：只记「哪种食物」，不记克重；临时自定义食物随引用内嵌其营养定义。 */
export interface TemplateFoodRef {
  foodId: string;
  customFood?: CustomFoodDraft;
}

export interface MealTemplate {
  id: string;
  /** 名字自动生成：食物名按「分类→拼音」以 · 连接，无编号；同名禁止重复创建。 */
  name: string;
  foods: TemplateFoodRef[];
  createdAt: string;
}

export interface DayTemplateMeal {
  id: string;
  name: string;
  ratio: number;
  foods: TemplateFoodRef[];
}

export interface DayTemplate {
  id: string;
  name: string;
  meals: DayTemplateMeal[];
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
