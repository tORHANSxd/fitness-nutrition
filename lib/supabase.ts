import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { calculateFoodKcalPer100g } from "@/lib/nutrition";
import { parseSavedPlanRow } from "@/lib/storageDocuments";
import { getPublicSupabaseConfig, isSupabaseConfigured as hasSupabaseConfig } from "@/lib/supabase/config";
import { foodCategories, type FoodItem, type MuscleGroup, type SavedPlan, type WeightBasis, type WorkoutSession, type WorkoutSet, type WorkoutSetsDocumentV1 } from "@/lib/types";

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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("训练组格式无效。");
  }
  const set = value as Record<string, unknown>;
  const weightKg = Number(set.weightKg);
  const reps = Number(set.reps);
  const rir = set.rir == null ? null : Number(set.rir);
  if (typeof set.id !== "string"
    || typeof set.exercise !== "string"
    || !muscleGroups.has(set.muscleGroup as MuscleGroup)
    || !Number.isFinite(weightKg)
    || !Number.isFinite(reps)
    || (rir !== null && !Number.isFinite(rir))) {
    throw new Error("训练组格式无效。");
  }
  return {
    id: set.id,
    exercise: set.exercise,
    muscleGroup: set.muscleGroup as MuscleGroup,
    weightKg,
    reps,
    rir,
    isWarmup: Boolean(set.isWarmup)
  };
}

export function mapWorkoutSessionRow(row: Record<string, unknown>): WorkoutSession {
  const document = row.sets;
  const rawSets = Array.isArray(document)
    ? document
    : document && typeof document === "object" && !Array.isArray(document)
      && (document as Record<string, unknown>).version === 1
      && Array.isArray((document as Record<string, unknown>).sets)
        ? (document as Record<string, unknown>).sets as unknown[]
        : null;
  if (!rawSets) {
    throw new Error("不支持的训练组文档版本。");
  }
  return {
    id: String(row.id),
    sessionDate: String(row.session_date),
    splitLabel: String(row.split_label),
    bodyweightKg: row.bodyweight_kg == null ? null : Number(row.bodyweight_kg),
    recovery: row.recovery == null ? null : Number(row.recovery),
    note: row.note == null ? "" : String(row.note),
    sets: rawSets.map(parseWorkoutSet),
    createdAt: String(row.created_at)
  };
}

export function workoutSessionToRow(session: WorkoutSession, user: User) {
  const sets: WorkoutSetsDocumentV1 = {
    version: 1,
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
