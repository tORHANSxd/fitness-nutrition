"use client";

import type { User } from "@supabase/supabase-js";
import { builtinFoods } from "@/lib/foods";
import { foodToRow, getSupabaseClient, mapFoodRow, mapPlanRow } from "@/lib/supabase";
import type { FoodItem, MealPlan, NutritionResult, SavedPlan, UserProfile } from "@/lib/types";

const privateFoodsKey = "fitness-nutrition-private-foods";
const savedPlansKey = "fitness-nutrition-saved-plans";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

export async function loadFoods(user: User | null): Promise<FoodItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    return [...builtinFoods, ...readLocal<FoodItem[]>(privateFoodsKey, [])];
  }

  const { data, error } = await supabase
    .from("foods")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  const remoteFoods = data.map((row) => mapFoodRow(row));
  const remoteIds = new Set(remoteFoods.map((food) => food.id));
  return [...builtinFoods.filter((food) => !remoteIds.has(food.id)), ...remoteFoods];
}

export async function saveFood(food: FoodItem, user: User | null): Promise<FoodItem> {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    const localFoods = readLocal<FoodItem[]>(privateFoodsKey, []);
    const savedFood = { ...food, id: food.id || crypto.randomUUID(), source: "user" as const };
    writeLocal(privateFoodsKey, [...localFoods.filter((item) => item.id !== savedFood.id), savedFood]);
    return savedFood;
  }

  const { data, error } = await supabase
    .from("foods")
    .insert(foodToRow({ ...food, source: "user" }, user))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapFoodRow(data);
}

export async function deleteFood(foodId: string, user: User | null): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    const localFoods = readLocal<FoodItem[]>(privateFoodsKey, []);
    writeLocal(
      privateFoodsKey,
      localFoods.filter((food) => food.id !== foodId)
    );
    return;
  }

  const { error } = await supabase.from("foods").delete().eq("id", foodId);
  if (error) {
    throw error;
  }
}

export async function savePlan(
  profile: UserProfile,
  meals: MealPlan[],
  result: NutritionResult,
  user: User | null
): Promise<SavedPlan> {
  const supabase = getSupabaseClient();
  const payload = {
    profile,
    meals,
    result
  };

  if (!supabase || !user) {
    const plans = readLocal<SavedPlan[]>(savedPlansKey, []);
    const savedPlan: SavedPlan = {
      id: crypto.randomUUID(),
      planDate: profile.planDate,
      profile,
      meals,
      result,
      createdAt: new Date().toISOString()
    };
    writeLocal(savedPlansKey, [savedPlan, ...plans.filter((plan) => plan.planDate !== profile.planDate)]);
    return savedPlan;
  }

  const { data, error } = await supabase
    .from("daily_plans")
    .upsert(
      {
        user_id: user.id,
        plan_date: profile.planDate,
        ...payload
      },
      { onConflict: "user_id,plan_date" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapPlanRow(data);
}

export async function loadPlans(user: User | null): Promise<SavedPlan[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    return readLocal<SavedPlan[]>(savedPlansKey, []);
  }

  const { data, error } = await supabase
    .from("daily_plans")
    .select("*")
    .order("plan_date", { ascending: false })
    .limit(30);

  if (error) {
    throw error;
  }

  return data.map((row) => mapPlanRow(row));
}

