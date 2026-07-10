"use client";

import type { User } from "@supabase/supabase-js";
import { builtinFoods } from "@/lib/foods";
import { calculateFoodKcalPer100g } from "@/lib/nutrition";
import { foodToOverrideRow, foodToRow, getSupabaseClient, mapFoodOverrideRow, mapFoodRow, mapPlanRow } from "@/lib/supabase";
import { dayTemplateFromRow, mealTemplateFromRow } from "@/lib/templates";
import type {
  DayTemplate,
  FoodItem,
  MealPlan,
  MealTemplate,
  NutritionResult,
  PlannerDraft,
  PlannerTemplates,
  SavedPlan,
  UserProfile
} from "@/lib/types";

// 全站数据一律只落 Supabase 云端：除登录 session（fitness-nutrition-auth-v1）外，
// 不再向客户端 localStorage 写入任何业务数据。未配置 Supabase 或未登录时抛明确错误，
// 由 AppShell 的登录门禁兜底引导。与 lib/trainingStorage.ts 保持一致。
export class StorageAuthError extends Error {
  constructor() {
    super("该功能需要登录后使用（数据仅保存在 Supabase 云端）。");
    this.name = "StorageAuthError";
  }
}

function requireClient(user: User | null) {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    throw new StorageAuthError();
  }
  return { supabase, user } as const;
}

const mealTemplateLimit = 24;
const dayTemplateLimit = 12;

// ---------------------------------------------------------------------------
// 分餐草稿（存 profiles.preferences.plannerDraft）
// 复用线上已有的每用户 profiles 表（jsonb preferences），无需新建表/手动 DDL：
// 读时取 preferences.plannerDraft；写时先读回现有 preferences 合并该键，避免覆盖其他偏好。
// ---------------------------------------------------------------------------

interface PlannerDraftPayload {
  profile: UserProfile;
  meals: MealPlan[];
  updatedAt?: string;
}

export async function loadPlannerDraft(user: User | null): Promise<PlannerDraft | null> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", authedUser.id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  const preferences = (data?.preferences ?? {}) as Record<string, unknown>;
  const draft = preferences.plannerDraft as PlannerDraftPayload | undefined;
  if (!draft || !draft.profile || !Array.isArray(draft.meals)) {
    return null;
  }
  return {
    profile: draft.profile,
    meals: draft.meals,
    updatedAt: draft.updatedAt ?? ""
  };
}

export async function savePlannerDraft(profile: UserProfile, meals: MealPlan[], user: User | null): Promise<PlannerDraft> {
  const { supabase, user: authedUser } = requireClient(user);
  const updatedAt = new Date().toISOString();

  // 先读现有 preferences 再合并 plannerDraft 写回，确保不会覆盖该用户的其他偏好键。
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", authedUser.id)
    .maybeSingle();
  if (readError) {
    throw readError;
  }
  const preferences = {
    ...((existing?.preferences as Record<string, unknown>) ?? {}),
    plannerDraft: { profile, meals, updatedAt }
  };

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: authedUser.id, preferences }, { onConflict: "id" });
  if (error) {
    throw error;
  }
  return { profile, meals, updatedAt };
}

// ---------------------------------------------------------------------------
// 减载周标记（存 profiles.preferences.deloadWeeks：周一起始日 YYYY-MM-DD 数组）
// v2 文档减载为"计划性(每6-7周) + 按需性(过度红线)"双触发，由用户在训练/安排页手动勾选。
// ---------------------------------------------------------------------------

export async function loadDeloadWeeks(user: User | null): Promise<string[]> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase.from("profiles").select("preferences").eq("id", authedUser.id).maybeSingle();
  if (error) {
    throw error;
  }
  const preferences = (data?.preferences ?? {}) as Record<string, unknown>;
  const weeks = preferences.deloadWeeks;
  return Array.isArray(weeks) ? weeks.filter((week): week is string => typeof week === "string") : [];
}

export async function saveDeloadWeeks(weeks: string[], user: User | null): Promise<string[]> {
  const { supabase, user: authedUser } = requireClient(user);
  // 与 plannerDraft 同一策略：先读回现有 preferences 合并该键，避免覆盖其他偏好。
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", authedUser.id)
    .maybeSingle();
  if (readError) {
    throw readError;
  }
  const preferences = {
    ...((existing?.preferences as Record<string, unknown>) ?? {}),
    deloadWeeks: weeks
  };
  const { error } = await supabase.from("profiles").upsert({ id: authedUser.id, preferences }, { onConflict: "id" });
  if (error) {
    throw error;
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// 计划模板（planner_templates：每模板一行，template_type = meal|day，整体存 payload）
// v2 只存食物引用（payload.foods / payload.meals[].foods），不存克重；
// 旧克重制行在读入时丢弃，下次保存整组替换时自动从库里清掉。
// ---------------------------------------------------------------------------

interface PlannerTemplateRow {
  id: string;
  template_type: string;
  name: string;
  payload: Record<string, unknown> | null;
  created_at?: string;
}

function mealTemplateToRow(template: MealTemplate, userId: string) {
  return {
    id: template.id,
    user_id: userId,
    template_type: "meal" as const,
    name: template.name,
    payload: {
      foods: template.foods,
      createdAt: template.createdAt
    },
    updated_at: new Date().toISOString()
  };
}

function dayTemplateToRow(template: DayTemplate, userId: string) {
  return {
    id: template.id,
    user_id: userId,
    template_type: "day" as const,
    name: template.name,
    payload: {
      meals: template.meals,
      createdAt: template.createdAt
    },
    updated_at: new Date().toISOString()
  };
}

export async function loadPlannerTemplates(user: User | null): Promise<PlannerTemplates> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("planner_templates")
    .select("id, template_type, name, payload, created_at")
    .eq("user_id", authedUser.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PlannerTemplateRow[];
  const mealTemplates = rows
    .filter((row) => row.template_type === "meal")
    .map(mealTemplateFromRow)
    .filter((template): template is MealTemplate => template !== null);
  const dayTemplates = rows
    .filter((row) => row.template_type === "day")
    .map(dayTemplateFromRow)
    .filter((template): template is DayTemplate => template !== null);
  return {
    mealTemplates: mealTemplates.slice(0, mealTemplateLimit),
    dayTemplates: dayTemplates.slice(0, dayTemplateLimit)
  };
}

export async function savePlannerTemplates(user: User | null, templates: PlannerTemplates): Promise<PlannerTemplates> {
  const { supabase, user: authedUser } = requireClient(user);
  const mealTemplates = templates.mealTemplates.slice(0, mealTemplateLimit);
  const dayTemplates = templates.dayTemplates.slice(0, dayTemplateLimit);
  const rows = [
    ...mealTemplates.map((template) => mealTemplateToRow(template, authedUser.id)),
    ...dayTemplates.map((template) => dayTemplateToRow(template, authedUser.id))
  ];
  const keepIds = rows.map((row) => row.id);

  // 先删该用户不在新集合里的模板行（实现“整组替换”语义），再 upsert 当前集合。
  let deleteQuery = supabase.from("planner_templates").delete().eq("user_id", authedUser.id);
  if (keepIds.length > 0) {
    deleteQuery = deleteQuery.not("id", "in", `(${keepIds.join(",")})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    throw deleteError;
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("planner_templates").upsert(rows, { onConflict: "id" });
    if (upsertError) {
      throw upsertError;
    }
  }

  return { mealTemplates, dayTemplates };
}

// ---------------------------------------------------------------------------
// 食物库（foods + food_overrides）
// ---------------------------------------------------------------------------

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
  const { supabase, user: authedUser } = requireClient(user);

  const [foodsResult, overridesResult] = await Promise.all([
    supabase
      .from("foods")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${authedUser.id}`)
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("food_overrides").select("*").eq("user_id", authedUser.id)
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
  const { supabase, user: authedUser } = requireClient(user);
  const normalizedFood = withDerivedFoodEnergy(food);

  if (isPublicFood(normalizedFood)) {
    const { data, error } = await supabase
      .from("food_overrides")
      .upsert(foodToOverrideRow(normalizedFood, authedUser), { onConflict: "user_id,base_food_id" })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return withDerivedFoodEnergy(mapFoodOverrideRow(data));
  }

  const payload = foodToRow({ ...normalizedFood, source: "user" }, authedUser);
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
  const { supabase, user: authedUser } = requireClient(user);

  if (foodId.startsWith("public-")) {
    const { error } = await supabase.from("food_overrides").delete().eq("user_id", authedUser.id).eq("base_food_id", foodId);
    if (error) {
      throw error;
    }
    return;
  }

  const { error } = await supabase.from("foods").delete().eq("id", foodId);
  if (error) {
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 每日计划（daily_plans）
// ---------------------------------------------------------------------------

export async function savePlan(
  profile: UserProfile,
  meals: MealPlan[],
  result: NutritionResult,
  user: User | null
): Promise<SavedPlan> {
  const { supabase, user: authedUser } = requireClient(user);

  const { data, error } = await supabase
    .from("daily_plans")
    .upsert(
      {
        user_id: authedUser.id,
        plan_date: profile.planDate,
        profile,
        meals,
        result
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
  const { supabase, user: authedUser } = requireClient(user);

  // 纵深防御：除 RLS 外，在应用层显式按 user_id 过滤，避免 RLS 万一被误配/关闭时泄露他人计划。
  const { data, error } = await supabase
    .from("daily_plans")
    .select("*")
    .eq("user_id", authedUser.id)
    .order("plan_date", { ascending: false })
    .limit(30);

  if (error) {
    throw error;
  }

  return data.map((row) => mapPlanRow(row));
}

export async function deletePlan(planId: string, user: User | null): Promise<void> {
  const { supabase, user: authedUser } = requireClient(user);

  // 同时限定 id 与 user_id，避免凭 id 误删/越权删他人计划（纵深防御，RLS 之外再加一层）。
  const { error } = await supabase.from("daily_plans").delete().eq("id", planId).eq("user_id", authedUser.id);
  if (error) {
    throw error;
  }
}
