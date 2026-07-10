import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { calculateFoodKcalPer100g } from "@/lib/nutrition";
import type { FoodItem, SavedPlan, WorkoutSession, WorkoutSet } from "@/lib/types";

let client: SupabaseClient | null = null;

function cleanPublicEnv(value: string | undefined) {
  return value?.replace(/^\uFEFF/, "").trim();
}

export function getSupabaseClient() {
  const url = cleanPublicEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = cleanPublicEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("your-anon-key")) {
    return null;
  }

  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        storageKey: "fitness-nutrition-auth-v1"
      }
    });
  }

  return client;
}

export function isSupabaseConfigured() {
  return getSupabaseClient() !== null;
}

export function mapFoodRow(row: Record<string, unknown>): FoodItem {
  return {
    id: String(row.id),
    userId: row.user_id == null ? null : String(row.user_id),
    name: String(row.name),
    category: row.category as FoodItem["category"],
    kcalPer100g: Number(row.kcal_per_100g),
    fatPer100g: Number(row.fat_per_100g),
    carbsPer100g: Number(row.carbs_per_100g),
    proteinPer100g: Number(row.protein_per_100g),
    weightBasis: row.weight_basis as FoodItem["weightBasis"],
    cookedRawRatio: row.cooked_raw_ratio == null ? null : Number(row.cooked_raw_ratio),
    source: row.user_id == null ? "public" : "user"
  };
}

export function mapFoodOverrideRow(row: Record<string, unknown>): FoodItem {
  return {
    id: String(row.base_food_id),
    userId: String(row.user_id),
    isUserOverride: true,
    name: String(row.name),
    category: row.category as FoodItem["category"],
    kcalPer100g: Number(row.kcal_per_100g),
    fatPer100g: Number(row.fat_per_100g),
    carbsPer100g: Number(row.carbs_per_100g),
    proteinPer100g: Number(row.protein_per_100g),
    weightBasis: row.weight_basis as FoodItem["weightBasis"],
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
    cooked_raw_ratio: food.cookedRawRatio ?? null,
    updated_at: new Date().toISOString()
  };
}

export function mapPlanRow(row: Record<string, unknown>): SavedPlan {
  return {
    id: String(row.id),
    planDate: String(row.plan_date),
    profile: row.profile as SavedPlan["profile"],
    meals: row.meals as SavedPlan["meals"],
    result: row.result as SavedPlan["result"],
    createdAt: String(row.created_at)
  };
}

export function mapWorkoutSessionRow(row: Record<string, unknown>): WorkoutSession {
  const rawSets = Array.isArray(row.sets) ? (row.sets as WorkoutSet[]) : [];
  return {
    id: String(row.id),
    sessionDate: String(row.session_date),
    splitLabel: String(row.split_label),
    bodyweightKg: row.bodyweight_kg == null ? null : Number(row.bodyweight_kg),
    recovery: row.recovery == null ? null : Number(row.recovery),
    note: row.note == null ? "" : String(row.note),
    sets: rawSets.map((set) => ({
      id: String(set.id),
      exercise: String(set.exercise),
      muscleGroup: set.muscleGroup,
      weightKg: Number(set.weightKg),
      reps: Number(set.reps),
      rir: set.rir == null ? null : Number(set.rir),
      isWarmup: Boolean(set.isWarmup)
    })),
    createdAt: String(row.created_at)
  };
}

export function workoutSessionToRow(session: WorkoutSession, user: User) {
  return {
    user_id: user.id,
    session_date: session.sessionDate,
    split_label: session.splitLabel,
    bodyweight_kg: session.bodyweightKg ?? null,
    recovery: session.recovery ?? null,
    note: session.note ?? null,
    sets: session.sets,
    updated_at: new Date().toISOString()
  };
}
