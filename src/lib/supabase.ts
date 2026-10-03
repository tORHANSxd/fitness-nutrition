import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { calculateFoodKcalPer100g } from "@/lib/nutrition";
import { parseSavedPlanRow } from "@/lib/storageDocuments";
import { assertDocument, boundedNumber, UnsupportedDocumentError } from "@/lib/planProtocol";
import { getPublicSupabaseConfig, isSupabaseConfigured as hasSupabaseConfig } from "@/lib/supabase/config";
import { foodCategories, type FoodItem, type MuscleGroup, type SavedPlan, type WeightBasis, type WorkoutSession, type WorkoutSet } from "@/lib/types";

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  const config = getPublicSupabaseConfig();
  if (!config) {
    return null;
  }

  if (!client) {
    client = createBrowserClient(config.url, config.anonKey);
  }

  return client;
}

export function isSupabaseConfigured() {
  return hasSupabaseConfig();
}

function mapFoodCategory(value: unknown): FoodItem["category"] {
  if ((foodCategories as readonly unknown[]).includes(value)) return value as FoodItem["category"];
  throw new Error(`不支持的食物分类：${String(value)}`);
}

function mapWeightBasis(value: unknown): WeightBasis {
  if (value === "raw" || value === "cooked" || value === "none") return value;
  throw new Error(`不支持的食物重量口径：${String(value)}`);
}

export function mapFoodRow(row: Record<string, unknown>): FoodItem {
  return {
    id: String(row.id),
    userId: row.user_id == null ? null : String(row.user_id),
    name: String(row.name),
    category: mapFoodCategory(row.category),
    kcalPer100g: Number(row.kcal_per_100g),
    fatPer100g: Number(row.fat_per_100g),
    carbsPer100g: Number(row.carbs_per_100g),
    proteinPer100g: Number(row.protein_per_100g),
    weightBasis: mapWeightBasis(row.weight_basis),
    cookedRawRatio: row.cooked_raw_ratio == null ? null : Number(row.cooked_raw_ratio),
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
    source: row.user_id == null ? "public" : "user"
  };
}

export function mapFoodOverrideRow(row: Record<string, unknown>): FoodItem {
  return {
    id: String(row.base_food_id),
    userId: String(row.user_id),
    isUserOverride: true,
    name: String(row.name),
    category: mapFoodCategory(row.category),
    kcalPer100g: Number(row.kcal_per_100g),
    fatPer100g: Number(row.fat_per_100g),
    carbsPer100g: Number(row.carbs_per_100g),
    proteinPer100g: Number(row.protein_per_100g),
    weightBasis: mapWeightBasis(row.weight_basis),
    cookedRawRatio: row.cooked_raw_ratio == null ? null : Number(row.cooked_raw_ratio),
    source: "public"
  };
}

export function foodToRow(food: FoodItem, user: User | null) {
  return {
    user_id: user?.id ?? food.userId ?? null,
    name: food.name,
    category: food.category,
    kcal_per_100g: calculateFoodKcalPer100g(food),
    fat_per_100g: food.fatPer100g,
    carbs_per_100g: food.carbsPer100g,
    protein_per_100g: food.proteinPer100g,
    weight_basis: food.weightBasis,
    cooked_raw_ratio: food.cookedRawRatio ?? null,
    source: food.source
  };
}

export function foodToOverrideRow(food: FoodItem, user: User) {
  return {
    user_id: user.id,
    base_food_id: food.id,
    name: food.name,
    category: food.category,
    kcal_per_100g: calculateFoodKcalPer100g(food),
    fat_per_100g: food.fatPer100g,
    carbs_per_100g: food.carbsPer100g,
    protein_per_100g: food.proteinPer100g,
    weight_basis: food.weightBasis,
    cooked_raw_ratio: food.cookedRawRatio ?? null
  };
}

export function mapPlanRow(row: Record<string, unknown>): SavedPlan {
  return parseSavedPlanRow(row);
}

const muscleGroups = new Set<MuscleGroup>([
  "chest", "back", "quads", "hamstrings", "glutes", "shoulders", "biceps", "triceps", "calves", "abs"
]);

function parseWorkoutSet(value: unknown): WorkoutSet {
  assertDocument(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("训练组格式无效。");
  }
  const set = value as Record<string, unknown>;
  const weightKg = set.weightKg === null ? null : Number(set.weightKg);
  const reps = set.reps === null ? null : Number(set.reps);
  const rir = set.rir == null ? null : Number(set.rir);
  if (typeof set.id !== "string"
    || typeof set.exercise !== "string"
    || !muscleGroups.has(set.muscleGroup as MuscleGroup)
    || (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0))
    || (reps !== null && (!Number.isInteger(reps) || reps < 0))
    || (rir !== null && (!Number.isFinite(rir) || rir < 0 || rir > 10))) {
    throw new Error("训练组格式无效。");
  }
  if (set.completed !== undefined && typeof set.completed !== "boolean") throw new Error("组完成状态无效。");
  if (set.loadType !== undefined && !["external", "bodyweight", "weighted_bodyweight", "assisted", "timed"].includes(String(set.loadType))) throw new Error("负荷类型无效。");
  if (set.side !== undefined && !["both", "left", "right"].includes(String(set.side))) throw new Error("训练侧别无效。");
  if (set.durationSeconds != null) boundedNumber(set.durationSeconds, 0, 86400, "秒数");
  for (const key of ["exerciseId", "equipmentId"] as const) if (set[key] !== undefined && (typeof set[key] !== "string" || set[key].length > 120)) throw new Error("动作/器械标识无效。");
  if (set.prescription != null) {
    const p = set.prescription as Record<string, unknown>;
    if (!["rpt", "straight", "core"].includes(String(p.kind))) throw new Error("训练处方无效。");
    boundedNumber(p.targetRir, 0, 10, "目标RIR");
    if (p.repRange !== undefined && (!Array.isArray(p.repRange) || p.repRange.length !== 2 || p.repRange.some(n => typeof n !== "number" || !Number.isInteger(n) || n < 0) || p.repRange[0] > p.repRange[1])) throw new Error("目标次数范围无效。");
  }
  if (set.completed === true && (set.loadType === "timed" ? !(Number(set.durationSeconds) > 0) : reps == null || reps <= 0)) throw new Error("完成组需要填写实际次数或秒数。");
  if (set.completed === true && set.loadType === "external" && weightKg == null) throw new Error("外部负重完成组需要实际重量。");
  return {
    ...set,
    id: set.id,
    exercise: set.exercise,
    muscleGroup: set.muscleGroup as MuscleGroup,
    weightKg,
    reps,
    rir,
    isWarmup: Boolean(set.isWarmup)
  } as WorkoutSet;
}

export function mapWorkoutSessionRow(row: Record<string, unknown>): WorkoutSession {
  assertDocument(row.sets);
  const document = row.sets;
  const rawSets = Array.isArray(document)
    ? document
    : document && typeof document === "object" && !Array.isArray(document)
      && [1, 2].includes(Number((document as Record<string, unknown>).version))
      && Array.isArray((document as Record<string, unknown>).sets)
        ? (document as Record<string, unknown>).sets as unknown[]
        : null;
  if (!rawSets) {
    throw new UnsupportedDocumentError("不支持的训练组文档版本，保留原记录，禁止覆盖。", row);
  }
  if (new Set(rawSets.map(s => (s as Record<string, unknown>).id)).size !== rawSets.length) throw new Error("训练组ID重复。");
  return {
    id: String(row.id),
    sessionDate: String(row.session_date),
    splitLabel: String(row.split_label),
    bodyweightKg: row.bodyweight_kg == null ? null : Number(row.bodyweight_kg),
    recovery: row.recovery == null ? null : Number(row.recovery),
    note: row.note == null ? "" : String(row.note),
    sets: rawSets.map(parseWorkoutSet),
    createdAt: String(row.created_at),
    status: row.status === "recorded" ? "recorded" : "legacy_unknown",
    ...(row.revision != null ? { revision: Number(row.revision) } : {}),
    ...(row.schedule_id != null ? { scheduleId: String(row.schedule_id) } : {})
  };
}

export function workoutSessionToRow(session: WorkoutSession, user: User) {
  const sets = {
    version: session.status === "recorded" || session.sets.some(s => s.completed !== undefined) ? 2 : 1,
    sets: session.sets.map(parseWorkoutSet)
  };
  return {
    user_id: user.id,
    session_date: session.sessionDate,
    split_label: session.splitLabel,
    bodyweight_kg: session.bodyweightKg ?? null,
    recovery: session.recovery ?? null,
    note: session.note ?? null,
    sets
  };
}
