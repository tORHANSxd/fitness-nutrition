import type { NutritionSnapshotV1, NutritionTargetResolution } from "@/lib/nutritionGoals/types";

export const foodCategories = ["主食", "蔬菜", "水果", "肉类", "豆类", "乳制品", "补剂", "坚果", "其他", "食物配料"] as const;

export type FoodCategory = (typeof foodCategories)[number];
export type WeightBasis = "raw" | "cooked" | "none";
export type Sex = "male" | "female";
export type TrainingTime = "morning" | "afternoon" | "evening" | "rest";
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
export type TrainingSplit = "fiveDayV2" | "pplLumbarSafe" | "upperLower" | "fullBody" | "rptAlternate8DayV4";
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

/** 碳水渐降的一步校准（v2 文档第五节）：deltaKcal 负 = 降热量（全部落在碳水），正 = 加回。date 为操作日 YYYY-MM-DD。 */
export interface CarbTaperStep {
  date: string;
  deltaKcal: number;
}

export interface UserProfile {
  targetMode?: "legacy" | "calibrated";
  allocationMode?: "ratio" | "explicitMacros";
  protocolSnapshot?: PlanProtocol;
  /** 单日覆盖，保存在当日文档，不改变协议及历史日期。 */
  scheduleOverride?: { trainingStartLocal?: string; preTrainingNoIntakeMinutes?: number; eatingWindow?: MealSchedule };
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityFactor: number;
  /** 预估运动消耗 kcal；留空按 0 参与公式。 */
  exerciseKcal?: number;
  /** 体脂率 %（来自体测记录或手填）。用于按去脂体重推蛋白目标；缺省按 25% 估算。 */
  bodyFatPct?: number | null;
  /** 手动覆盖：每日目标热量 kcal。缺省(undefined) = 公式 TDEE − calorieDeficit。 */
  targetKcal?: number;
  /** 手动覆盖：每日蛋白目标 g。缺省 = 公式 去脂体重×2.5（体脂<20% ×2.8）向上取整到 5g。 */
  proteinTargetG?: number;
  /** 手动覆盖：每日脂肪目标 g。缺省 = 公式 体重×0.65 取整（文档 60–65、不低于 0.6g/kg）。 */
  fatTargetG?: number;
  /** 旧方针遗留（张老师碳循环）：蛋白 g/kg。仅为历史草稿/计划反序列化兼容保留，不再参与计算。 */
  proteinPerKg?: number;
  /** 减脂热量缺口 kcal/天（缺省 600，对应文档"赤字 550–650"）；每 2 周按体重降幅校准 ±100–150。 */
  calorieDeficit?: number;
  /**
   * 碳水渐降步进历史（v2 文档第五节"每 2 周校准热量"）：当前生效校准 = Σ deltaKcal，
   * 叠加在最终目标热量上、蛋白/脂肪不动——扣减全部落在碳水。缺省/空数组 = 最初始阶段（第 0 步，不减降）。
   * 只由用户手动追加/撤销，系统绝不自动写入。
   */
  carbTaperSteps?: CarbTaperStep[];
  goalType?: NutritionGoal;
  weeklyWeightChangePct?: number;
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
  archivedAt?: string | null;
  source: "public" | "user";
  /** 每 100g 称重中可食用的比例；未知时不推测。 */
  ediblePercent?: number;
}

export interface FoodSnapshotV1 {
  version: 1;
  name: string;
  category: FoodCategory;
  kcalPer100g: number;
  carbsPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  weightBasis: WeightBasis;
  cookedRawRatio: number | null;
  ediblePercent?: number;
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
  foodSnapshot?: FoodSnapshotV1;
  grams: number;
  useEdiblePortion?: boolean;
  /** 随条目保存当时使用的比例，不跟随食物库后续变化。 */
  ediblePercent?: number;
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
  kind?: "main" | "snack";
  schedule?: MealSchedule;
  /** 每种宏量的独立份额；热量始终派生，不保存第二套克数。 */
  targetAllocation?: MacroRatio;
}

export interface MealSchedule {
  start: string;
  end: string;
  endDayOffset: 0 | 1;
}

export interface PlanProtocol {
  id: string;
  schemaVersion: 1 | 2;
  /** v2 uses the protocol UUID as its persistent idempotency request key. */
  requestId?: string;
  nutrition?: NutritionSnapshotV1;
  presetId: "eveningTreRptV4";
  version: number;
  effectiveFrom: string;
  timeZone: string;
  targetMode: "calibrated";
  allocationMode: "explicitMacros";
  dailyTarget: MacroTotals;
  eatingWindow: MealSchedule;
  trainingStartLocal: string;
  preTrainingNoIntakeMinutes: number;
  mealSlots: Array<Pick<MealPlan, "id" | "name"> & { kind: "main" | "snack"; schedule: MealSchedule; targetAllocation: MacroRatio }>;
  trainingCycle: { id: "rptAlternate8DayV4"; anchorDate: string; phase: "recovery"; lengthDays: 8 };
  reviewRules: { minWeightsPerWeek: number; minIntakeDaysPerWeek: number; stableTargetDays: number; firstReviewDays: number };
  supersedesId: string | null;
  changeReason: string;
  evidenceWindow?: { from: string; to: string };
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
  /** New consumers prefer this frozen, nullable expenditure over legacy numeric fields. */
  targetResolution?: NutritionTargetResolution;
  estimatesAvailable?: boolean;
  bmr: number;
  tdee: number;
  plannedCalorieDelta: number;
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
  updatedAt: string;
  schemaVersion: number;
  algorithmVersion: string | null;
  integrityFlags: string[];
}

export interface SavedPlanSummary {
  id: string;
  planDate: string;
  trainingTime: TrainingTime;
  dailyTarget: MacroTotals;
  actualTotals: MacroTotals;
  createdAt: string;
  updatedAt: string;
  integrityFlags: string[];
}

export interface HeatmapPlanInput {
  id: string;
  planDate: string;
  profile: UserProfile;
  meals: MealPlan[];
  result: Pick<NutritionResult, "bmr" | "dailyTarget">;
  schemaVersion: number;
  algorithmVersion: string | null;
  integrityFlags: string[];
}

export interface DailyFoodSnapshot {
  foodId: string;
  name: string;
  grams: number;
  totals: MacroTotals;
}

export interface ExerciseEnergyEntry {
  id: string;
  name: string;
  kcal: number;
}

export interface DailyCheckinActualV2 {
  version: 2;
  foods: DailyFoodSnapshot[];
  exercises: ExerciseEnergyEntry[];
  bmrKcal: number;
  activityKcal: number;
  totalsSnapshot?: MacroTotals;
  habits?: {
    vegetableGrams?: number;
    waterLiters?: number;
    steps?: number;
    postWorkoutCarbs?: number;
    postWorkoutProtein?: number;
    sleepHours?: number;
    hungerLevel?: number;
    moodLevel?: number;
  };
}

export interface ActualFoodEntry {
  id: string;
  foodId: string;
  foodSnapshot: FoodSnapshotV1;
  grams: number;
  energyBasis: "macros" | "label";
}

export interface MealEvent {
  id: string;
  linkedPlanMealId?: string;
  startedAt?: string;
  endedAt?: string;
  timeZone: string;
  actualFoodEntries: ActualFoodEntry[];
  entryMethod: "measured" | "estimated" | "confirmed_from_plan";
  containsCalories: boolean;
  note?: string;
}

export interface DailyCheckinActualV3 extends Omit<DailyCheckinActualV2, "version" | "totalsSnapshot"> {
  version: 3;
  /** Immutable target source for a newly started record; actual intake remains independent. */
  targetProtocolSnapshot?: PlanProtocol;
  mealEvents: MealEvent[];
  /** 从 V2 显式继续记录时保留全天原始量，餐时仍未知。 */
  legacyActual?: DailyCheckinActualV2;
  intakeComplete: boolean;
  recovery?: { fatigue?: number; footPain?: number; trainingTolerance?: "good" | "limited"; persistentSymptoms?: boolean };
}

export type DailyCheckinActual = DailyCheckinActualV2 | DailyCheckinActualV3;

export interface DailyCheckin {
  revision?: number;
  id: string;
  planDate: string;
  actual: DailyCheckinActual;
  target: MacroTotals | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type HeatmapPalette = "red-positive" | "green-positive";

export interface PlannerDraft {
  profile: UserProfile;
  meals: MealPlan[];
  updatedAt: string;
  revision: number;
  schemaVersion: number;
}

/** 模板里的食物引用：只记「哪种食物」，不记克重；临时自定义食物随引用内嵌其营养定义。 */
export interface TemplateFoodRef {
  foodId: string;
  useEdiblePortion?: boolean;
  ediblePercent?: number;
  foodSnapshot?: FoodSnapshotV1;
  customFood?: CustomFoodDraft;
}

export interface MealTemplate {
  kind?: MealPlan["kind"];
  schedule?: MealSchedule;
  targetAllocation?: MacroRatio;
  id: string;
  /** 名字自动生成：食物名按「分类→拼音」以 · 连接，无编号；同名禁止重复创建。 */
  name: string;
  foods: TemplateFoodRef[];
  createdAt: string;
}

export interface DayTemplateMeal {
  kind?: MealPlan["kind"];
  schedule?: MealSchedule;
  targetAllocation?: MacroRatio;
  id: string;
  name: string;
  ratio: number;
  foods: TemplateFoodRef[];
}

export interface DayTemplate {
  /** New day templates restore the complete layout. Absent on legacy food-only templates. */
  includesMealLayout?: boolean;
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
  completed?: boolean;
  loadType?: "external" | "bodyweight" | "weighted_bodyweight" | "assisted" | "timed";
  durationSeconds?: number | null;
  side?: "both" | "left" | "right";
  exerciseId?: string;
  equipmentId?: string;
  prescription?: SetPrescription;
  id: string;
  exercise: string;
  muscleGroup: MuscleGroup;
  weightKg: number | null;
  reps: number | null;
  /** Reps In Reserve 剩余次数；null = 未记录（不参与 RIR 相关统计）。 */
  rir: number | null;
  /** 热身组不计入有效训练量。 */
  isWarmup: boolean;
}

export interface WorkoutSetsDocumentV1 {
  version: 1;
  sets: WorkoutSet[];
}

/** 一次训练（一天一条）。逐组数据放在 sets 里以 jsonb 存入 Supabase。 */
export interface WorkoutSession {
  scheduleId?: string | null;
  status?: "recorded" | "legacy_unknown";
  revision?: number;
  id: string;
  sessionDate: string;
  splitLabel: string;
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
  exerciseId?: string;
  loadType?: WorkoutSet["loadType"];
  prescription?: SetPrescription[];
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
  exercises: ProgramExercise[];
}

export interface ProgramTemplate {
  phase?: "recovery";
  id: TrainingSplit;
  name: string;
  summary: string;
  daysPerWeek: number;
  days: ProgramDay[];
}

export interface SetPrescription {
  repRange?: [number, number];
  targetRir: number;
  kind: "rpt" | "straight" | "core";
}

export interface WorkoutSchedule {
  id: string;
  sessionDate: string;
  dayKind: "training" | "rest";
  protocolId: string | null;
  prescription: ProgramDay | null;
  plannedStart: string | null;
  timeZone: string;
  status: "planned" | "skipped" | "cancelled";
  revision: number;
  manuallyEdited: boolean;
}
