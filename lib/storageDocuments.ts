import {
  foodCategories,
  type DailyCheckinActual,
  type MacroRatio,
  type MacroTotals,
  type MealFoodEntry,
  type MealPlan,
  type MealRecommendation,
  type NutritionResult,
  type PlannerDraft,
  type SavedPlan,
  type UserProfile,
} from "@/lib/types";
import { parseFoodSnapshot } from "@/lib/foodSnapshots";
import { edibleSelection } from "@/lib/foodWeights";
import { assertDocument, assertMealAllocations, boundedNumber, mealMetadata, parseMealSchedule, parsePlanProtocol, record, UnsupportedDocumentError, validTime } from "@/lib/planProtocol";
import { isDateKey } from "@/lib/dateTime";
import { normalizeActualV3 } from "@/lib/actualIntake";
import { nutritionInputFingerprint } from "@/lib/nutritionGoals/calculator";
import type { NutritionTargetResolution } from "@/lib/nutritionGoals/types";

export const DAILY_PLAN_SCHEMA_VERSION = 3;
export const PLANNER_DRAFT_SCHEMA_VERSION = 3;
export const NUTRITION_ALGORITHM_VERSION = "nutrition-v3-explicit";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value: unknown, fallback = 0): number {
  const number = finiteNumber(value);
  return number == null ? fallback : Math.max(0, number);
}

export function parseMacroTotals(value: unknown, allowSigned = false): MacroTotals | null {
  if (!isRecord(value)) return null;
  const kcal = finiteNumber(value.kcal);
  const carbs = finiteNumber(value.carbs);
  const protein = finiteNumber(value.protein);
  const fat = finiteNumber(value.fat);
  return kcal == null || carbs == null || protein == null || fat == null || (!allowSigned && [kcal, carbs, protein, fat].some(n => n < 0))
    ? null
    : { kcal, carbs, protein, fat };
}

function optionalFiniteNumber(value: unknown, label: string): number | undefined {
  if (value == null) return undefined;
  const number = finiteNumber(value);
  if (number == null) throw new Error(`计划档案字段 ${label} 无效。`);
  return number;
}

function parseUserProfile(value: unknown): UserProfile {
  assertDocument(value);
  if (!isRecord(value)
    || (value.sex !== "male" && value.sex !== "female")
    || !["morning", "afternoon", "evening", "rest"].includes(String(value.trainingTime))
    || typeof value.planDate !== "string" || !isDateKey(value.planDate)) {
    throw new Error("计划档案格式无效。");
  }

  const age = finiteNumber(value.age);
  const heightCm = finiteNumber(value.heightCm);
  const weightKg = finiteNumber(value.weightKg);
  const activityFactor = finiteNumber(value.activityFactor);
  if (age == null || heightCm == null || weightKg == null || activityFactor == null) {
    throw new Error("计划档案包含无效数字。");
  }

  const profile: UserProfile = {
    sex: value.sex,
    age,
    heightCm,
    weightKg,
    activityFactor,
    trainingTime: value.trainingTime as UserProfile["trainingTime"],
    planDate: value.planDate,
  };
  if (value.targetMode != null && !["legacy", "calibrated"].includes(String(value.targetMode))) throw new Error("目标模式无效。");
  if (value.allocationMode != null && !["ratio", "explicitMacros"].includes(String(value.allocationMode))) throw new Error("分配模式无效。");
  if (value.targetMode != null) profile.targetMode = value.targetMode as UserProfile["targetMode"];
  if (value.allocationMode != null) profile.allocationMode = value.allocationMode as UserProfile["allocationMode"];
  if (value.protocolSnapshot != null) profile.protocolSnapshot = parsePlanProtocol(value.protocolSnapshot);
  if (value.targetMode === "calibrated" && (!profile.protocolSnapshot || value.allocationMode !== "explicitMacros")) throw new Error("校准模式缺少协议及显式分配。");
  if (value.scheduleOverride != null) {
    const override = record(value.scheduleOverride);
    profile.scheduleOverride = {
      ...override,
      ...(override.trainingStartLocal != null ? { trainingStartLocal: validTime(override.trainingStartLocal) } : {}),
      ...(override.preTrainingNoIntakeMinutes != null ? { preTrainingNoIntakeMinutes: boundedNumber(override.preTrainingNoIntakeMinutes, 0, 1440, "训练前间隔") } : {}),
      ...(override.eatingWindow != null ? { eatingWindow: parseMealSchedule(override.eatingWindow) } : {}),
    };
  }
  for (const key of ["exerciseKcal", "targetKcal", "proteinTargetG", "fatTargetG", "calorieDeficit", "weeklyWeightChangePct"] as const) {
    const number = optionalFiniteNumber(value[key], key);
    if (number !== undefined) profile[key] = number;
  }
  if (value.bodyFatPct === null) {
    profile.bodyFatPct = null;
  } else {
    const bodyFatPct = optionalFiniteNumber(value.bodyFatPct, "bodyFatPct");
    if (bodyFatPct !== undefined) profile.bodyFatPct = bodyFatPct;
  }
  if (value.goalType != null) {
    if (value.goalType !== "cut" && value.goalType !== "maintain" && value.goalType !== "bulk") {
      throw new Error("计划档案字段 goalType 无效。");
    }
    profile.goalType = value.goalType;
  }
  if (value.carbTaperSteps != null) {
    if (!Array.isArray(value.carbTaperSteps)) throw new Error("计划档案字段 carbTaperSteps 无效。");
    profile.carbTaperSteps = value.carbTaperSteps.map((step) => {
      if (!isRecord(step) || typeof step.date !== "string" || finiteNumber(step.deltaKcal) == null) {
        throw new Error("计划档案的碳水校准记录无效。");
      }
      return { date: step.date, deltaKcal: Number(step.deltaKcal) };
    });
  }
  return profile;
}

export function normalizeUserProfile(value: unknown): UserProfile {
  return parseUserProfile(value);
}

function parseCustomFood(value: unknown): MealFoodEntry["customFood"] {
  if (!isRecord(value)
    || typeof value.name !== "string"
    || !(foodCategories as readonly unknown[]).includes(value.category)
    || finiteNumber(value.carbsPer100g) == null
    || finiteNumber(value.proteinPer100g) == null
    || finiteNumber(value.fatPer100g) == null) {
    return undefined;
  }
  return value as unknown as NonNullable<MealFoodEntry["customFood"]>;
}

function parseMealEntry(value: unknown): MealFoodEntry {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.foodId !== "string"
    || finiteNumber(value.grams) == null || Number(value.grams) < 0
    || typeof value.locked !== "boolean") {
    throw new Error("计划餐食条目格式无效。");
  }

  const snapshot = parseFoodSnapshot(value.foodSnapshot);
  if (value.foodSnapshot != null && !snapshot) throw new UnsupportedDocumentError("食品快照无效或版本不支持；原始内容已保留。", value);
  const customFood = parseCustomFood(value.customFood);
  for (const key of ["minGrams", "maxGrams"] as const) if (value[key] != null && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0)) throw new Error("克重限制必须为有限非负数。");
  if (value.minGrams != null && value.maxGrams != null && Number(value.minGrams) > Number(value.maxGrams)) throw new Error("最小克重不能超过最大克重。");
  return {
    ...value,
    ...edibleSelection(value),
    id: value.id,
    foodId: value.foodId,
    grams: Number(value.grams),
    locked: value.locked,
    minGrams: value.minGrams == null ? null : finiteNumber(value.minGrams),
    maxGrams: value.maxGrams == null ? null : finiteNumber(value.maxGrams),
    ...(snapshot ? { foodSnapshot: snapshot } : {}),
    ...(customFood ? { customFood } : {}),
  };
}

export function parseMeals(value: unknown): MealPlan[] {
  assertDocument(value);
  if (!Array.isArray(value)) throw new Error("计划餐次格式无效。");
  return value.map((meal) => {
    if (!isRecord(meal)
      || typeof meal.id !== "string"
      || typeof meal.name !== "string"
      || finiteNumber(meal.ratio) == null
      || typeof meal.locked !== "boolean"
      || !Array.isArray(meal.entries)) {
      throw new Error("计划餐次格式无效。");
    }
    return {
      ...meal,
      id: meal.id,
      name: meal.name,
      ratio: Number(meal.ratio),
      locked: meal.locked,
      entries: meal.entries.map(parseMealEntry),
      ...mealMetadata(meal),
    };
  });
}

function parseMacroRatio(value: unknown): MacroRatio | null {
  if (!isRecord(value)) return null;
  const carbs = finiteNumber(value.carbs);
  const protein = finiteNumber(value.protein);
  const fat = finiteNumber(value.fat);
  return carbs == null || protein == null || fat == null ? null : { carbs, protein, fat };
}

function parseRecommendation(value: unknown): MealRecommendation {
  if (!isRecord(value) || typeof value.mealId !== "string" || !isRecord(value.recommendedEntries)) {
    throw new Error("计划餐次推荐格式无效。");
  }
  const target = parseMacroTotals(value.target);
  const actual = parseMacroTotals(value.actual);
  const deficit = parseMacroTotals(value.deficit, true);
  const actualDeficit = parseMacroTotals(value.actualDeficit, true) ?? deficit;
  const targetRatio = parseMacroRatio(value.targetRatio);
  const actualRatio = parseMacroRatio(value.actualRatio);
  const recommendedEntries: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value.recommendedEntries)) {
    const amount = finiteNumber(raw);
    if (amount == null) throw new Error("计划推荐克重格式无效。");
    recommendedEntries[key] = amount;
  }
  if (!target || !actual || !actualDeficit || !targetRatio || !actualRatio || !deficit) {
    throw new Error("计划餐次推荐格式无效。");
  }
  return { mealId: value.mealId, target, actual, actualDeficit, targetRatio, actualRatio, recommendedEntries, deficit };
}

function parseNutritionResult(value: unknown): NutritionResult {
  assertDocument(value);
  if (!isRecord(value) || !Array.isArray(value.mealRecommendations) || !Array.isArray(value.conflicts)) {
    throw new Error("计划计算结果格式无效。");
  }
  const bmr = finiteNumber(value.bmr);
  const tdee = finiteNumber(value.tdee);
  const plannedCalorieDelta = value.plannedCalorieDelta == null ? 0 : finiteNumber(value.plannedCalorieDelta);
  const dailyTarget = parseMacroTotals(value.dailyTarget);
  const cycleAverageTarget = parseMacroTotals(value.cycleAverageTarget) ?? dailyTarget;
  const actualTotals = parseMacroTotals(value.actualTotals);
  const recommendedTotals = parseMacroTotals(value.recommendedTotals);
  const targetRatio = parseMacroRatio(value.targetRatio);
  const actualRatio = parseMacroRatio(value.actualRatio);
  const remaining = parseMacroTotals(value.remaining, true);
  const recommendedRemaining = parseMacroTotals(value.recommendedRemaining, true);
  let targetResolution: NutritionTargetResolution | undefined;
  if (value.targetResolution != null) {
    const resolution = record(value.targetResolution);
    if (resolution.algorithmVersion !== "nutrition-v5.0" || resolution.policyVersion !== "nutrition-goals-v5.0" || resolution.presetVersion !== 1) throw new UnsupportedDocumentError("不支持的营养计算结果版本；原始数据已保留。", value);
    const expenditure = record(resolution.expenditure);
    for (const key of ["rmrKcal", "tdeeKcal"] as const) if (expenditure[key] !== null && (typeof expenditure[key] !== "number" || !Number.isFinite(expenditure[key]) || expenditure[key] <= 0)) throw new Error("营养消耗快照无效。");
    if (resolution.status !== "valid" || typeof resolution.inputFingerprint !== "string" || !Array.isArray(resolution.trace)
      || nutritionInputFingerprint(resolution.resolvedTarget) !== nutritionInputFingerprint(dailyTarget)) throw new Error("目标结果与冻结目标不一致。");
    targetResolution = structuredClone(resolution) as unknown as NutritionTargetResolution;
  }
  if (bmr == null || tdee == null || plannedCalorieDelta == null || !cycleAverageTarget || !dailyTarget
    || !actualTotals || !recommendedTotals || !targetRatio || !actualRatio || !remaining || !recommendedRemaining
    || value.conflicts.some((item) => typeof item !== "string")) {
    throw new Error("计划计算结果格式无效。");
  }
  return {
    bmr,
    ...(targetResolution ? { targetResolution } : {}),
    ...(typeof value.estimatesAvailable === "boolean" ? { estimatesAvailable: value.estimatesAvailable } : {}),
    tdee,
    plannedCalorieDelta,
    cycleAverageTarget,
    dailyTarget,
    actualTotals,
    recommendedTotals,
    targetRatio,
    actualRatio,
    remaining,
    recommendedRemaining,
    mealRecommendations: value.mealRecommendations.map(parseRecommendation),
    conflicts: value.conflicts as string[],
  };
}

export function normalizeNutritionResult(value: unknown): NutritionResult {
  return parseNutritionResult(value);
}

export function parseSavedPlanRow(row: Record<string, unknown>): SavedPlan {
  const schemaVersion = finiteNumber(row.schema_version) ?? 1;
  if (![1, 2, DAILY_PLAN_SCHEMA_VERSION].includes(schemaVersion)) {
    throw new UnsupportedDocumentError(`不支持的每日计划版本：${String(row.schema_version)}；原始内容已保留。`, row);
  }
  const profile = parseUserProfile(row.profile);
  const meals = parseMeals(row.meals);
  if (profile.planDate !== row.plan_date) throw new UnsupportedDocumentError("计划业务日期与文档日期不一致。", row);
  if (profile.allocationMode === "explicitMacros") assertMealAllocations(meals);
  const result = parseNutritionResult(row.result);
  if (profile.protocolSnapshot?.nutrition && (nutritionInputFingerprint(result.targetResolution) !== nutritionInputFingerprint(profile.protocolSnapshot.nutrition.result)
    || nutritionInputFingerprint(result.dailyTarget) !== nutritionInputFingerprint(profile.protocolSnapshot.dailyTarget))) throw new UnsupportedDocumentError("每日计划与执行协议冻结结果不一致。", row);
  return {
    id: String(row.id),
    planDate: String(row.plan_date),
    profile,
    meals,
    result,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    schemaVersion,
    algorithmVersion: typeof row.algorithm_version === "string" ? row.algorithm_version : null,
    integrityFlags: Array.isArray(row.integrity_flags)
      ? row.integrity_flags.filter((flag): flag is string => typeof flag === "string")
      : [],
  };
}

export function parsePlannerDraftRow(row: Record<string, unknown>): PlannerDraft {
  const revision = finiteNumber(row.revision);
  const schemaVersion = finiteNumber(row.schema_version);
  if (revision == null || revision < 1 || schemaVersion == null || ![1, 2, PLANNER_DRAFT_SCHEMA_VERSION].includes(schemaVersion)) {
    throw new UnsupportedDocumentError("云端草稿版本无效；原始内容已保留。", row);
  }
  const profile = parseUserProfile(row.profile_snapshot);
  const meals = parseMeals(row.meals);
  if (row.plan_date != null && row.plan_date !== profile.planDate) throw new UnsupportedDocumentError("草稿业务日期与文档不一致。", row);
  if (profile.allocationMode === "explicitMacros") assertMealAllocations(meals);
  return {
    profile,
    meals,
    updatedAt: String(row.updated_at ?? ""),
    revision,
    schemaVersion,
  };
}

export function parseLegacyPlannerDraft(value: unknown): PlannerDraft | null {
  if (!isRecord(value) || value.profile == null || !Array.isArray(value.meals)) return null;
  return {
    profile: parseUserProfile(value.profile),
    meals: parseMeals(value.meals),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    revision: 0,
    schemaVersion: 1,
  };
}

function parseDailyFoods(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const foodId = String(item.foodId ?? item.food_id ?? "").trim();
    const name = String(item.name ?? "").trim();
    const totals = parseMacroTotals(item.totals);
    const grams = finiteNumber(item.grams);
    return foodId && name && totals && grams != null && grams >= 0
      ? [{ foodId, name, grams, totals }]
      : [];
  });
}

function parseExercises(value: unknown, planDate: string) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const name = String(item.name ?? "").trim();
    const kcal = finiteNumber(item.kcal);
    return name && kcal != null && kcal >= 0
      ? [{ id: String(item.id ?? `${planDate}-exercise-${index}`), name, kcal }]
      : [];
  });
}

function optionalHabit(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number == null ? undefined : Math.max(0, number);
}

export function parseDailyCheckinActual(
  value: unknown,
  row: Record<string, unknown>,
  planDate: string,
): DailyCheckinActual {
  assertDocument(value);
  if (!isRecord(value)) throw new Error("每日实际记录格式无效。");
  const version = value.version == null ? 1 : finiteNumber(value.version);
  if (version === 3) {
    const legacy = value.legacyActual == null ? undefined : parseDailyCheckinActual(value.legacyActual, {}, planDate);
    if (legacy && legacy.version !== 2) throw new Error("历史实际快照必须为 V2。");
    return normalizeActualV3(value, legacy);
  }
  if (version !== 1 && version !== 2) throw new UnsupportedDocumentError(`不支持的每日实际记录版本：${String(value.version)}`, value);

  const foods = parseDailyFoods(value.foods);
  const exercises = parseExercises(value.exercises, planDate);
  if (((Array.isArray(value.foods) && foods.length !== value.foods.length)
      || (Array.isArray(value.exercises) && exercises.length !== value.exercises.length))) {
    throw new UnsupportedDocumentError("每日实际记录包含损坏条目，保留原文并停止写入。", value);
  }

  const legacyTotals = parseMacroTotals(value.totalsSnapshot)
    ?? parseMacroTotals(value.totals)
    ?? parseMacroTotals(value);
  const sourceHabits = isRecord(value.habits) ? value.habits : {};
  const legacyRow = version === 1 ? row : {};
  const habits = {
    vegetableGrams: optionalHabit(sourceHabits.vegetableGrams ?? legacyRow.vegetable_grams),
    waterLiters: optionalHabit(sourceHabits.waterLiters ?? legacyRow.water_liters),
    steps: optionalHabit(sourceHabits.steps ?? legacyRow.steps),
    postWorkoutCarbs: optionalHabit(sourceHabits.postWorkoutCarbs ?? legacyRow.post_workout_carbs),
    postWorkoutProtein: optionalHabit(sourceHabits.postWorkoutProtein ?? legacyRow.post_workout_protein),
    sleepHours: optionalHabit(sourceHabits.sleepHours ?? legacyRow.sleep_hours),
    hungerLevel: optionalHabit(sourceHabits.hungerLevel ?? legacyRow.hunger_level),
    moodLevel: optionalHabit(sourceHabits.moodLevel ?? legacyRow.mood_level),
  };
  const hasHabits = Object.values(habits).some((item) => item !== undefined);

  return {
    version: 2,
    foods,
    exercises,
    bmrKcal: nonNegative(value.bmrKcal ?? value.bmr_kcal),
    activityKcal: nonNegative(value.activityKcal ?? value.activity_kcal),
    ...(legacyTotals ? { totalsSnapshot: legacyTotals } : {}),
    ...(hasHabits ? { habits } : {}),
  };
}
