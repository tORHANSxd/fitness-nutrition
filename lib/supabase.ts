import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { FoodItem, SavedPlan } from "@/lib/types";

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url.includes("your-project") || anonKey.includes("your-anon-key")) {
    return null;
  }

  if (!client) {
    client = createClient(url, anonKey);
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

export function foodToRow(food: FoodItem, user: User | null) {
  return {
    user_id: user?.id ?? food.userId ?? null,
    name: food.name,
    category: food.category,
    kcal_per_100g: food.kcalPer100g,
    fat_per_100g: food.fatPer100g,
    carbs_per_100g: food.carbsPer100g,
    protein_per_100g: food.proteinPer100g,
    weight_basis: food.weightBasis,
    cooked_raw_ratio: food.cookedRawRatio ?? null,
    source: food.source
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

