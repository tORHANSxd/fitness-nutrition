"use client";

import type { User } from "@supabase/supabase-js";
import { builtinFoods } from "@/lib/foods";
import { calculateFoodKcalPer100g } from "@/lib/nutrition";
import { foodToOverrideRow, foodToRow, getSupabaseClient, mapFoodOverrideRow, mapFoodRow, mapPlanRow } from "@/lib/supabase";
import type { FoodItem, MealPlan, NutritionResult, PlannerDraft, PlannerTemplates, SavedPlan, UserProfile } from "@/lib/types";

const privateFoodsKey = "fitness-nutrition-private-foods";
const publicFoodOverridesKey = "fitness-nutrition-public-food-overrides";
const savedPlansKey = "fitness-nutrition-saved-plans";
const plannerDraftsKey = "fitness-nutrition-planner-drafts";
const plannerTemplatesKey = "fitness-nutrition-planner-templates";

const emptyPlannerTemplates: PlannerTemplates = {
  mealTemplates: [],
  dayTemplates: []
};

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

export function getPlannerStorageUserId(user: User | null): string {
  return user?.id ?? "local";
}

export function loadPlannerDraft(user: User | null): PlannerDraft | null {
  const drafts = readLocal<Record<string, PlannerDraft>>(plannerDraftsKey, {});
  return drafts[getPlannerStorageUserId(user)] ?? null;
}

export function savePlannerDraft(profile: UserProfile, meals: MealPlan[], user: User | null): PlannerDraft {
  const drafts = readLocal<Record<string, PlannerDraft>>(plannerDraftsKey, {});
  const draft: PlannerDraft = {
    profile,
    meals,
    updatedAt: new Date().toISOString()
  };
  writeLocal(plannerDraftsKey, {
    ...drafts,
    [getPlannerStorageUserId(user)]: draft
  });
  return draft;
}

export function loadPlannerTemplates(user: User | null): PlannerTemplates {
  const templatesByUser = readLocal<Record<string, PlannerTemplates>>(plannerTemplatesKey, {});
  const templates = templatesByUser[getPlannerStorageUserId(user)];
  return templates
    ? {
        mealTemplates: templates.mealTemplates ?? [],
        dayTemplates: templates.dayTemplates ?? []
      }
    : emptyPlannerTemplates;
}

export function savePlannerTemplates(user: User | null, templates: PlannerTemplates): PlannerTemplates {
  const templatesByUser = readLocal<Record<string, PlannerTemplates>>(plannerTemplatesKey, {});
  const nextTemplates = {
    mealTemplates: templates.mealTemplates.slice(0, 24),
    dayTemplates: templates.dayTemplates.slice(0, 12)
  };
  writeLocal(plannerTemplatesKey, {
    ...templatesByUser,
    [getPlannerStorageUserId(user)]: nextTemplates
  });
  return nextTemplates;
}

function isPublicFood(food: Pick<FoodItem, "id" | "source">) {
  return food.source === "public" || food.id.startsWith("public-");
}

function applyPublicOverrides(baseFoods: FoodItem[], overrides: FoodItem[]) {
  const overridesById = new Map(overrides.map((food) => [food.id, food]));
  return baseFoods.map((food) => {
    const override = overridesById.get(food.id);
    const mergedFood = override
      ? {
          ...food,
          ...override,
          id: food.id,
          source: "public" as const,
          isUserOverride: true
        }
      : food;
    return withDerivedFoodEnergy(mergedFood);
  });
}

function withDerivedFoodEnergy(food: FoodItem): FoodItem {
  return {
    ...food,
    kcalPer100g: calculateFoodKcalPer100g(food)
  };
}

export async function loadFoods(user: User | null): Promise<FoodItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    const publicOverrides = readLocal<FoodItem[]>(publicFoodOverridesKey, []);
    return [...applyPublicOverrides(builtinFoods, publicOverrides), ...readLocal<FoodItem[]>(privateFoodsKey, []).map(withDerivedFoodEnergy)];
  }

  const [foodsResult, overridesResult] = await Promise.all([
    supabase
      .from("foods")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("food_overrides").select("*").eq("user_id", user.id)
  ]);

  if (foodsResult.error) {
    throw foodsResult.error;
  }
  if (overridesResult.error) {
    throw overridesResult.error;
  }

  const remoteFoods = foodsResult.data.map((row) => mapFoodRow(row));
  const publicOverrides = overridesResult.data.map((row) => mapFoodOverrideRow(row));
  const remoteIds = new Set(remoteFoods.map((food) => food.id));
  const mergedPublicFoods = applyPublicOverrides(
    [...builtinFoods.filter((food) => !remoteIds.has(food.id)), ...remoteFoods.filter((food) => food.source === "public")],
    publicOverrides
  );
  return [...mergedPublicFoods, ...remoteFoods.filter((food) => food.source === "user").map(withDerivedFoodEnergy)];
}

export async function saveFood(food: FoodItem, user: User | null): Promise<FoodItem> {
  const normalizedFood = withDerivedFoodEnergy(food);
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    const storageKey = isPublicFood(normalizedFood) ? publicFoodOverridesKey : privateFoodsKey;
    const localFoods = readLocal<FoodItem[]>(storageKey, []);
    const savedFood: FoodItem = isPublicFood(normalizedFood)
      ? { ...normalizedFood, source: "public", isUserOverride: true }
      : { ...normalizedFood, id: normalizedFood.id || crypto.randomUUID(), source: "user" };
    writeLocal(storageKey, [...localFoods.filter((item) => item.id !== savedFood.id), savedFood]);
    return savedFood;
  }

  if (isPublicFood(normalizedFood)) {
    const { data, error } = await supabase
      .from("food_overrides")
      .upsert(foodToOverrideRow(normalizedFood, user), { onConflict: "user_id,base_food_id" })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return withDerivedFoodEnergy(mapFoodOverrideRow(data));
  }

  const payload = foodToRow({ ...normalizedFood, source: "user" }, user);
  if (normalizedFood.id) {
    const { data, error } = await supabase.from("foods").update(payload).eq("id", normalizedFood.id).select("*").single();

    if (error) {
      throw error;
    }

    return withDerivedFoodEnergy(mapFoodRow(data));
  }

  const { data, error } = await supabase
    .from("foods")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return withDerivedFoodEnergy(mapFoodRow(data));
}

export async function deleteFood(foodId: string, user: User | null): Promise<void> {
  const supabase = getSupabaseClient();
  if (foodId.startsWith("public-")) {
    if (!supabase || !user) {
      const localOverrides = readLocal<FoodItem[]>(publicFoodOverridesKey, []);
      writeLocal(
        publicFoodOverridesKey,
        localOverrides.filter((food) => food.id !== foodId)
      );
      return;
    }

    const { error } = await supabase.from("food_overrides").delete().eq("user_id", user.id).eq("base_food_id", foodId);
    if (error) {
      throw error;
    }
    return;
  }

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
