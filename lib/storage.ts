"use client";

import type { User } from "@supabase/supabase-js";
import { builtinFoods, customFoodsFromMeals } from "@/lib/foods";
import { attachFoodSnapshots, unresolvedFoodFlags } from "@/lib/foodSnapshots";
import { calculateFoodKcalPer100g } from "@/lib/nutrition";
import {
  DAILY_PLAN_SCHEMA_VERSION,
  NUTRITION_ALGORITHM_VERSION,
  PLANNER_DRAFT_SCHEMA_VERSION,
  normalizeNutritionResult,
  normalizeUserProfile,
  parseDailyCheckinActual,
  parseLegacyPlannerDraft,
  parseMacroTotals,
  parseMeals,
  parsePlannerDraftRow,
} from "@/lib/storageDocuments";
import { foodToOverrideRow, foodToRow, getSupabaseClient, mapFoodOverrideRow, mapFoodRow, mapPlanRow } from "@/lib/supabase";
import { dayTemplateFromRow, mealTemplateFromRow } from "@/lib/templates";
import type {
  DailyCheckin,
  DailyCheckinActual,
  DayTemplate,
  FoodFormState,
  FoodItem,
  HeatmapPlanInput,
  MacroTotals,
  MealPlan,
  MealTemplate,
  NutritionResult,
  PlannerDraft,
  PlannerTemplates,
  SavedPlan,
  SavedPlanSummary,
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

function mapDailyCheckinRow(row: Record<string, unknown>): DailyCheckin {
  const planDate = String(row.plan_date);
  return {
    id: String(row.id),
    planDate,
    actual: parseDailyCheckinActual(row.actual, row, planDate),
    target: parseMacroTotals(row.target),
    completed: Boolean(row.completed),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

const mealTemplateLimit = 24;
const dayTemplateLimit = 12;
const foodColumns = "id,user_id,name,category,kcal_per_100g,fat_per_100g,carbs_per_100g,protein_per_100g,weight_basis,cooked_raw_ratio,archived_at";
const foodOverrideColumns = "user_id,base_food_id,name,category,kcal_per_100g,fat_per_100g,carbs_per_100g,protein_per_100g,weight_basis,cooked_raw_ratio";
const planColumns = "id,plan_date,profile,meals,result,created_at,updated_at,schema_version,algorithm_version,integrity_flags";
const planSummaryColumns = "id,plan_date,created_at,updated_at,integrity_flags,training_time:profile->>trainingTime,daily_target:result->dailyTarget,actual_totals:result->actualTotals";
const heatmapPlanColumns = "id,plan_date,profile,meals,schema_version,algorithm_version,integrity_flags,bmr:result->bmr,daily_target:result->dailyTarget";
const checkinColumns = "id,plan_date,actual,target,completed,created_at,updated_at,vegetable_grams,water_liters,steps,post_workout_carbs,post_workout_protein,sleep_hours,hunger_level,mood_level";

// ---------------------------------------------------------------------------
// 分餐草稿优先存 planner_drafts；migration 尚未部署时兼容读写
// profiles.preferences.plannerDraft，避免新客户端在发布过渡期中断。
// ---------------------------------------------------------------------------

export class PlannerDraftConflictError extends Error {
  constructor() {
    super("云端草稿已被另一处修改，请刷新后再继续。");
    this.name = "PlannerDraftConflictError";
  }
}

export interface SavePlannerDraftOptions {
  expectedRevision?: number | null;
  force?: boolean;
  foods?: FoodItem[];
}

function isMissingStorageSchema(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
  return code === "42P01" || code === "PGRST202" || code === "PGRST205"
    || (/planner_drafts|deload_weeks|save_planner_draft_v2|set_deload_week_v1/i.test(message)
      && /does not exist|schema cache|not found/i.test(message));
}

export async function loadPlannerDraft(user: User | null): Promise<PlannerDraft | null> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data: currentDraft, error: currentError } = await supabase
    .from("planner_drafts")
    .select("plan_date,profile_snapshot,meals,schema_version,revision,updated_at")
    .eq("user_id", authedUser.id)
    .maybeSingle();

  if (currentError && !isMissingStorageSchema(currentError)) throw currentError;
  if (currentDraft) return parsePlannerDraftRow(currentDraft as Record<string, unknown>);

  const { data, error } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", authedUser.id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  const preferences = (data?.preferences ?? {}) as Record<string, unknown>;
  return parseLegacyPlannerDraft(preferences.plannerDraft);
}

export async function savePlannerDraft(
  profile: UserProfile,
  meals: MealPlan[],
  user: User | null,
  options: SavePlannerDraftOptions = {},
): Promise<PlannerDraft> {
  const { supabase, user: authedUser } = requireClient(user);
  const profileDocument = normalizeUserProfile(profile);
  const foodsById = new Map(
    [...builtinFoods, ...customFoodsFromMeals(meals), ...(options.foods ?? [])].map((food) => [food.id, food]),
  );
  const snapshotMeals = parseMeals(attachFoodSnapshots(meals, foodsById));
  const expectedRevision = options.expectedRevision && options.expectedRevision > 0
    ? options.expectedRevision
    : null;
  const force = options.force ?? expectedRevision == null;
  const { data, error } = await supabase.rpc("save_planner_draft_v2", {
    p_plan_date: profileDocument.planDate,
    p_profile_snapshot: profileDocument,
    p_meals: snapshotMeals,
    p_schema_version: PLANNER_DRAFT_SCHEMA_VERSION,
    p_expected_revision: expectedRevision,
    p_force: force,
  });

  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) throw new Error("草稿保存未返回版本号。");
    return {
      profile: profileDocument,
      meals: snapshotMeals,
      updatedAt: String(row.updated_at ?? ""),
      revision: Number(row.revision),
      schemaVersion: PLANNER_DRAFT_SCHEMA_VERSION,
    };
  }
  if (/draft_conflict/i.test(String(error.message)) || String(error.code) === "40001") {
    throw new PlannerDraftConflictError();
  }
  if (!isMissingStorageSchema(error)) throw error;

  const updatedAt = new Date().toISOString();
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
    plannerDraft: { profile: profileDocument, meals: snapshotMeals, updatedAt }
  };

  const { error: fallbackError } = await supabase
    .from("profiles")
    .upsert({ id: authedUser.id, preferences }, { onConflict: "id" });
  if (fallbackError) {
    throw fallbackError;
  }
  return {
    profile: profileDocument,
    meals: snapshotMeals,
    updatedAt,
    revision: 0,
    schemaVersion: 1,
  };
}

// ---------------------------------------------------------------------------
// 减载周标记（存 profiles.preferences.deloadWeeks：周一起始日 YYYY-MM-DD 数组）
// v2 文档减载为"计划性(每6-7周) + 按需性(过度红线)"双触发，由用户在训练/安排页手动勾选。
// ---------------------------------------------------------------------------

export async function loadDeloadWeeks(user: User | null): Promise<string[]> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data: rows, error: rowsError } = await supabase
    .from("deload_weeks")
    .select("week_start")
    .eq("user_id", authedUser.id)
    .order("week_start", { ascending: true });
  if (!rowsError) return (rows ?? []).map((row) => String(row.week_start));
  if (!isMissingStorageSchema(rowsError)) throw rowsError;

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
  const normalized = Array.from(new Set(weeks)).sort();
  const { data: currentRows, error: currentError } = await supabase
    .from("deload_weeks")
    .select("week_start")
    .eq("user_id", authedUser.id);
  if (currentError) {
    if (!isMissingStorageSchema(currentError)) throw currentError;
    const { data: existing, error: readError } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", authedUser.id)
      .maybeSingle();
    if (readError) throw readError;
    const preferences = { ...((existing?.preferences as Record<string, unknown>) ?? {}), deloadWeeks: normalized };
    const { error } = await supabase.from("profiles").upsert({ id: authedUser.id, preferences }, { onConflict: "id" });
    if (error) throw error;
    return normalized;
  }

  const current = new Set((currentRows ?? []).map((row) => String(row.week_start)));
  await Promise.all([
    ...normalized.filter((week) => !current.has(week)).map((week) => setDeloadWeek(week, true, user)),
    ...Array.from(current).filter((week) => !normalized.includes(week)).map((week) => setDeloadWeek(week, false, user)),
  ]);
  return normalized;
}

export async function setDeloadWeek(weekStart: string, enabled: boolean, user: User | null): Promise<void> {
  const { supabase } = requireClient(user);
  const { error } = await supabase.rpc("set_deload_week_v1", {
    p_week_start: weekStart,
    p_enabled: enabled,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// 计划模板（planner_templates：每模板一行，单行 CRUD）
// ---------------------------------------------------------------------------

interface PlannerTemplateRow {
  id: string;
  template_type: string;
  name: string;
  payload: Record<string, unknown> | null;
  created_at?: string;
  schema_version?: number;
  fingerprint?: string | null;
}

type PlannerTemplate = MealTemplate | DayTemplate;

function templateFingerprint(value: unknown): string {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v3:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function plannerTemplateToRow(template: PlannerTemplate, userId: string) {
  let templateType: "meal" | "day";
  let payload: Record<string, unknown>;
  if ("foods" in template) {
    templateType = "meal";
    payload = { version: 3, foods: template.foods };
  } else {
    templateType = "day";
    payload = { version: 3, meals: template.meals };
  }
  const document = { templateType, name: template.name, payload };
  return {
    id: template.id,
    user_id: userId,
    template_type: templateType,
    name: template.name,
    payload,
    schema_version: 3,
    fingerprint: templateFingerprint(document),
  };
}

function plannerTemplateFromRow(row: PlannerTemplateRow): PlannerTemplate {
  const template = row.template_type === "meal"
    ? mealTemplateFromRow(row)
    : row.template_type === "day"
      ? dayTemplateFromRow(row)
      : null;
  if (!template) throw new Error(`模板 ${row.id} 的数据格式无效。`);
  return template;
}

export async function loadPlannerTemplates(user: User | null): Promise<PlannerTemplates> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("planner_templates")
    .select("id,template_type,name,payload,created_at,schema_version,fingerprint")
    .eq("user_id", authedUser.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PlannerTemplateRow[];
  const templates = rows.map(plannerTemplateFromRow);
  const mealTemplates = templates.filter((template): template is MealTemplate => "foods" in template);
  const dayTemplates = templates.filter((template): template is DayTemplate => "meals" in template);
  return {
    mealTemplates: mealTemplates.slice(0, mealTemplateLimit),
    dayTemplates: dayTemplates.slice(0, dayTemplateLimit)
  };
}

export async function createPlannerTemplate(template: PlannerTemplate, user: User | null): Promise<PlannerTemplate> {
  const { supabase, user: authedUser } = requireClient(user);
  const row = plannerTemplateToRow(template, authedUser.id);
  const { data, error } = await supabase
    .from("planner_templates")
    .insert({ ...row, created_at: template.createdAt })
    .select("id,template_type,name,payload,created_at,schema_version,fingerprint")
    .single();
  if (error) throw error;
  const saved = plannerTemplateFromRow(data as PlannerTemplateRow);
  return saved;
}

export async function updatePlannerTemplate(template: PlannerTemplate, user: User | null): Promise<PlannerTemplate> {
  const { supabase, user: authedUser } = requireClient(user);
  const row = plannerTemplateToRow(template, authedUser.id);
  const { data, error } = await supabase
    .from("planner_templates")
    .update({
      template_type: row.template_type,
      name: row.name,
      payload: row.payload,
      schema_version: row.schema_version,
      fingerprint: row.fingerprint,
    })
    .eq("id", row.id)
    .eq("user_id", authedUser.id)
    .select("id,template_type,name,payload,created_at,schema_version,fingerprint")
    .single();
  if (error) throw error;
  const saved = plannerTemplateFromRow(data as PlannerTemplateRow);
  return saved;
}

export async function deletePlannerTemplate(templateId: string, user: User | null): Promise<void> {
  const { supabase, user: authedUser } = requireClient(user);
  const { error } = await supabase
    .from("planner_templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", authedUser.id);
  if (error) throw error;
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
      .select(foodColumns)
      .or(`user_id.is.null,user_id.eq.${authedUser.id}`)
      .is("archived_at", null)
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("food_overrides").select(foodOverrideColumns).eq("user_id", authedUser.id)
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
      .select(foodOverrideColumns)
      .single();

    if (error) {
      throw error;
    }

    return withDerivedFoodEnergy(mapFoodOverrideRow(data));
  }

  const payload = foodToRow({ ...normalizedFood, source: "user" }, authedUser);
  if (normalizedFood.id) {
    const { data, error } = await supabase
      .from("foods")
      .update(payload)
      .eq("id", normalizedFood.id)
      .eq("user_id", authedUser.id)
      .select(foodColumns)
      .single();

    if (error) {
      throw error;
    }

    return withDerivedFoodEnergy(mapFoodRow(data));
  }

  const { data, error } = await supabase
    .from("foods")
    .insert(payload)
    .select(foodColumns)
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

  const { error } = await supabase
    .from("foods")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", foodId)
    .eq("user_id", authedUser.id);
  if (error) {
    throw error;
  }
}

export async function loadArchivedFoods(user: User | null): Promise<FoodItem[]> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("foods")
    .select(foodColumns)
    .eq("user_id", authedUser.id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => withDerivedFoodEnergy(mapFoodRow(row)));
}

export async function restoreFood(foodId: string, user: User | null): Promise<FoodItem> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("foods")
    .update({ archived_at: null })
    .eq("id", foodId)
    .eq("user_id", authedUser.id)
    .select(foodColumns)
    .single();
  if (error) throw error;
  return withDerivedFoodEnergy(mapFoodRow(data));
}

export async function importUserFoods(
  forms: FoodFormState[],
  user: User | null,
  atomic = true,
): Promise<{ inserted: number; errors: Array<{ index: number; message: string }> }> {
  const { supabase } = requireClient(user);
  const rows = forms.map((food) => ({
    name: food.name.trim(),
    category: food.category,
    kcal_per_100g: calculateFoodKcalPer100g(food),
    fat_per_100g: food.fatPer100g,
    carbs_per_100g: food.carbsPer100g,
    protein_per_100g: food.proteinPer100g,
    weight_basis: food.weightBasis,
    cooked_raw_ratio: food.cookedRawRatio ?? null,
  }));
  const { data, error } = await supabase.rpc("import_user_foods_v1", {
    p_rows: rows,
    p_atomic: atomic,
  });
  if (error) throw error;
  const result = data as { inserted?: unknown; errors?: unknown } | null;
  return {
    inserted: Number(result?.inserted ?? 0),
    errors: Array.isArray(result?.errors)
      ? result.errors.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as Record<string, unknown>;
          return [{ index: Number(row.index), message: String(row.message ?? "导入失败") }];
        })
      : [],
  };
}

// ---------------------------------------------------------------------------
// 每日计划（daily_plans）
// ---------------------------------------------------------------------------

export async function savePlan(
  profile: UserProfile,
  meals: MealPlan[],
  result: NutritionResult,
  user: User | null,
  foods: FoodItem[] = [],
): Promise<SavedPlan> {
  const { supabase, user: authedUser } = requireClient(user);
  const profileDocument = normalizeUserProfile(profile);
  const resultDocument = normalizeNutritionResult(result);
  const foodsById = new Map(
    [...builtinFoods, ...customFoodsFromMeals(meals), ...foods].map((food) => [food.id, food]),
  );
  const snapshotMeals = parseMeals(attachFoodSnapshots(meals, foodsById));
  const integrityFlags = unresolvedFoodFlags(snapshotMeals, foodsById);

  const { data, error } = await supabase
    .from("daily_plans")
    .upsert(
      {
        user_id: authedUser.id,
        plan_date: profileDocument.planDate,
        profile: profileDocument,
        meals: snapshotMeals,
        result: resultDocument,
        schema_version: DAILY_PLAN_SCHEMA_VERSION,
        algorithm_version: NUTRITION_ALGORITHM_VERSION,
        integrity_flags: integrityFlags,
      },
      { onConflict: "user_id,plan_date" }
    )
    .select(planColumns)
    .single();

  if (error) {
    throw error;
  }

  return mapPlanRow(data);
}

export async function loadPlans(user: User | null): Promise<SavedPlan[]> {
  return (await loadPlanPage({ user })).items;
}

export interface PlanCursor {
  planDate: string;
  id: string;
}

export interface LoadPlanPageOptions {
  user: User | null;
  limit?: number;
  before?: PlanCursor | null;
}

function mapPlanSummaryRow(row: Record<string, unknown>): SavedPlanSummary {
  const dailyTarget = parseMacroTotals(row.daily_target);
  const actualTotals = parseMacroTotals(row.actual_totals);
  const trainingTime = String(row.training_time);
  if (!dailyTarget || !actualTotals || !["morning", "afternoon", "evening", "rest"].includes(trainingTime)) {
    throw new Error(`历史计划 ${String(row.id)} 的摘要格式无效。`);
  }
  return {
    id: String(row.id),
    planDate: String(row.plan_date),
    trainingTime: trainingTime as SavedPlanSummary["trainingTime"],
    dailyTarget,
    actualTotals,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    integrityFlags: Array.isArray(row.integrity_flags)
      ? row.integrity_flags.filter((flag): flag is string => typeof flag === "string")
      : [],
  };
}

export async function loadPlanPage({ user, limit = 30, before = null }: LoadPlanPageOptions): Promise<{
  items: SavedPlan[];
  nextCursor: PlanCursor | null;
}> {
  const { supabase, user: authedUser } = requireClient(user);
  const pageSize = Math.min(100, Math.max(1, Math.trunc(limit)));
  let query = supabase
    .from("daily_plans")
    .select(planColumns)
    .eq("user_id", authedUser.id)
    .order("plan_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  if (before) {
    query = query.or(`plan_date.lt.${before.planDate},and(plan_date.eq.${before.planDate},id.lt.${before.id})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const hasNextPage = (data?.length ?? 0) > pageSize;
  const rows = (data ?? []).slice(0, pageSize);
  const items = rows.map((row) => mapPlanRow(row));
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasNextPage && last ? { planDate: last.planDate, id: last.id } : null,
  };
}

export async function loadPlanSummaryPage({ user, limit = 30, before = null }: LoadPlanPageOptions): Promise<{
  items: SavedPlanSummary[];
  nextCursor: PlanCursor | null;
}> {
  const { supabase, user: authedUser } = requireClient(user);
  const pageSize = Math.min(100, Math.max(1, Math.trunc(limit)));
  let query = supabase
    .from("daily_plans")
    .select(planSummaryColumns)
    .eq("user_id", authedUser.id)
    .order("plan_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  if (before) {
    query = query.or(`plan_date.lt.${before.planDate},and(plan_date.eq.${before.planDate},id.lt.${before.id})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const hasNextPage = (data?.length ?? 0) > pageSize;
  const items = (data ?? []).slice(0, pageSize).map((row) => mapPlanSummaryRow(row));
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasNextPage && last ? { planDate: last.planDate, id: last.id } : null,
  };
}

export async function loadPlansInRange(user: User | null, fromDate: string, toDate: string): Promise<SavedPlan[]> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("daily_plans")
    .select(planColumns)
    .eq("user_id", authedUser.id)
    .gte("plan_date", fromDate)
    .lte("plan_date", toDate)
    .order("plan_date", { ascending: true });

  if (error) {
    throw error;
  }
  return data.map((row) => mapPlanRow(row));
}

export async function loadHeatmapPlanInputs(user: User | null, fromDate: string, toDate: string): Promise<HeatmapPlanInput[]> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("daily_plans")
    .select(heatmapPlanColumns)
    .eq("user_id", authedUser.id)
    .gte("plan_date", fromDate)
    .lte("plan_date", toDate)
    .order("plan_date", { ascending: true });
  if (error) throw error;
  return data.map((row) => {
    const bmr = Number(row.bmr);
    const dailyTarget = parseMacroTotals(row.daily_target);
    const schemaVersion = Number(row.schema_version ?? 1);
    if (!Number.isFinite(bmr) || !dailyTarget || (schemaVersion !== 1 && schemaVersion !== DAILY_PLAN_SCHEMA_VERSION)) {
      throw new Error(`热力图计划 ${String(row.plan_date)} 格式无效。`);
    }
    return {
      id: String(row.id),
      planDate: String(row.plan_date),
      profile: normalizeUserProfile(row.profile),
      meals: parseMeals(row.meals),
      result: { bmr, dailyTarget },
      schemaVersion,
      algorithmVersion: typeof row.algorithm_version === "string" ? row.algorithm_version : null,
      integrityFlags: Array.isArray(row.integrity_flags)
        ? row.integrity_flags.filter((flag): flag is string => typeof flag === "string")
        : []
    };
  });
}

export async function deletePlan(planId: string, user: User | null): Promise<void> {
  const { supabase, user: authedUser } = requireClient(user);

  // 同时限定 id 与 user_id，避免凭 id 误删/越权删他人计划（纵深防御，RLS 之外再加一层）。
  const { error } = await supabase.from("daily_plans").delete().eq("id", planId).eq("user_id", authedUser.id);
  if (error) {
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 每日实际记录（daily_checkins）
// ---------------------------------------------------------------------------

export async function completeDailyRecord(
  profile: UserProfile,
  meals: MealPlan[],
  result: NutritionResult,
  actual: DailyCheckinActual,
  target: MacroTotals,
  user: User | null,
  foods: FoodItem[] = [],
): Promise<DailyCheckin> {
  const { supabase } = requireClient(user);
  const profileDocument = normalizeUserProfile(profile);
  const resultDocument = normalizeNutritionResult(result);
  const actualDocument = parseDailyCheckinActual(actual, {}, profileDocument.planDate);
  const targetDocument = parseMacroTotals(target);
  if (!targetDocument) throw new Error("每日目标格式无效。");
  const foodsById = new Map(
    [...builtinFoods, ...customFoodsFromMeals(meals), ...foods].map((food) => [food.id, food]),
  );
  const snapshotMeals = parseMeals(attachFoodSnapshots(meals, foodsById));
  const { data, error } = await supabase.rpc("complete_daily_record_v2", {
    p_plan_date: profileDocument.planDate,
    p_profile: profileDocument,
    p_meals: snapshotMeals,
    p_result: resultDocument,
    p_plan_schema_version: DAILY_PLAN_SCHEMA_VERSION,
    p_algorithm_version: NUTRITION_ALGORITHM_VERSION,
    p_integrity_flags: unresolvedFoodFlags(snapshotMeals, foodsById),
    p_actual: actualDocument,
    p_target: targetDocument,
    p_completed: true,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("完成当日记录未返回有效数据。");
  }
  return mapDailyCheckinRow(data as Record<string, unknown>);
}

export async function loadDailyCheckin(planDate: string, user: User | null): Promise<DailyCheckin | null> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("daily_checkins")
    .select(checkinColumns)
    .eq("user_id", authedUser.id)
    .eq("plan_date", planDate)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? mapDailyCheckinRow(data) : null;
}

export async function loadDailyCheckins(
  user: User | null,
  fromDate: string,
  toDate: string
): Promise<DailyCheckin[]> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("daily_checkins")
    .select(checkinColumns)
    .eq("user_id", authedUser.id)
    .gte("plan_date", fromDate)
    .lte("plan_date", toDate)
    .order("plan_date", { ascending: true });

  if (error) {
    throw error;
  }
  return data.map((row) => mapDailyCheckinRow(row));
}

export async function saveDailyCheckin(
  checkin: Omit<DailyCheckin, "id" | "createdAt" | "updatedAt">,
  user: User | null
): Promise<DailyCheckin> {
  const { supabase, user: authedUser } = requireClient(user);
  const actual = parseDailyCheckinActual(checkin.actual, {}, checkin.planDate);
  const target = checkin.target == null ? null : parseMacroTotals(checkin.target);
  if (checkin.target != null && !target) throw new Error("每日目标格式无效。");
  const { data, error } = await supabase
    .from("daily_checkins")
    .upsert({
      user_id: authedUser.id,
      plan_date: checkin.planDate,
      actual,
      target,
      completed: checkin.completed,
    }, { onConflict: "user_id,plan_date" })
    .select(checkinColumns)
    .single();

  if (error) {
    throw error;
  }
  return mapDailyCheckinRow(data);
}
