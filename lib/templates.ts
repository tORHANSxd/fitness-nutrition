import { createCustomFood, sortFoods } from "@/lib/foods";
import { foodFromSnapshot, foodSnapshotFromFood, parseFoodSnapshot } from "@/lib/foodSnapshots";
import { getDefaultMealEntrySettings } from "@/lib/nutrition";
import {
  foodCategories,
  type CustomFoodDraft,
  type DayTemplate,
  type DayTemplateMeal,
  type FoodItem,
  type MealFoodEntry,
  type MealPlan,
  type MealTemplate,
  type PlannerTemplates,
  type TemplateFoodRef
} from "@/lib/types";

// ---------------------------------------------------------------------------
// 模板 v3：根节点带 version，只记录「哪些食物」（TemplateFoodRef），不记录克重。
// 名字自动生成 = 食物名按「分类→拼音」排序后以 · 连接，无编号；同名模板禁止重复创建。
// ---------------------------------------------------------------------------

/** 把模板食物引用解析成 FoodItem：优先食物库，内嵌自定义食物则就地物化。 */
export function resolveTemplateFood(ref: TemplateFoodRef, foodsById: Map<string, FoodItem>): FoodItem | undefined {
  const library = foodsById.get(ref.foodId);
  if (library) {
    return library;
  }
  if (ref.customFood) {
    return createCustomFood(ref.customFood, ref.foodId);
  }
  const snapshot = parseFoodSnapshot(ref.foodSnapshot);
  if (snapshot) return foodFromSnapshot(ref.foodId, snapshot);
  return undefined;
}

/** 模板自动命名：食物名去重后按「分类→拼音」排序，以 · 连接；空列表回退「空模板」。 */
export function buildTemplateName(refs: TemplateFoodRef[], foodsById: Map<string, FoodItem>): string {
  const foods: FoodItem[] = [];
  const seenNames = new Set<string>();
  for (const ref of refs) {
    const food = resolveTemplateFood(ref, foodsById);
    if (!food || seenNames.has(food.name)) {
      continue;
    }
    seenNames.add(food.name);
    foods.push(food);
  }
  if (foods.length === 0) {
    return "空模板";
  }
  return sortFoods(foods)
    .map((food) => food.name)
    .join("·");
}

/** 从当前餐条目提取模板食物引用（丢弃克重/锁定，仅保留食物身份与内嵌自定义定义）。 */
export function templateRefsFromEntries(
  entries: MealFoodEntry[],
  foodsById?: ReadonlyMap<string, FoodItem>,
): TemplateFoodRef[] {
  return entries.map((entry) => {
    const liveFood = foodsById?.get(entry.foodId);
    const foodSnapshot = entry.foodSnapshot ?? (liveFood ? foodSnapshotFromFood(liveFood) : undefined);
    return {
      foodId: entry.foodId,
      ...(foodSnapshot ? { foodSnapshot } : {}),
      ...(entry.customFood ? { customFood: entry.customFood } : {}),
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseTemplateCustomFood(value: unknown): CustomFoodDraft | null {
  if (!isRecord(value)
    || typeof value.name !== "string"
    || !(foodCategories as readonly unknown[]).includes(value.category)
    || ![value.carbsPer100g, value.proteinPer100g, value.fatPer100g]
      .every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0)) {
    return null;
  }
  return {
    name: value.name,
    category: value.category as CustomFoodDraft["category"],
    carbsPer100g: value.carbsPer100g as number,
    proteinPer100g: value.proteinPer100g as number,
    fatPer100g: value.fatPer100g as number,
  };
}

/** 应用模板：为每个食物引用生成条目，克重取分类默认值；解析不到的引用跳过。 */
export function materializeTemplateEntries(
  refs: TemplateFoodRef[],
  foodsById: Map<string, FoodItem>,
  meal?: Pick<MealPlan, "id" | "name">
): MealFoodEntry[] {
  return refs.map((ref): MealFoodEntry => {
    const food = resolveTemplateFood(ref, foodsById);
    if (!food) {
      return { id: crypto.randomUUID(), foodId: ref.foodId, grams: 0, locked: true };
    }
    const defaults = getDefaultMealEntrySettings(food, meal);
    return {
      id: crypto.randomUUID(),
      foodId: ref.foodId,
      grams: defaults.grams,
      locked: false,
      minGrams: defaults.minGrams,
      maxGrams: defaults.maxGrams,
      foodSnapshot: foodSnapshotFromFood(food),
      ...(ref.customFood ? { customFood: ref.customFood } : {})
    };
  });
}

/** 应用全天模板：物化每餐条目，比例沿用模板记录的餐次占比。 */
export function materializeDayTemplate(template: DayTemplate, foodsById: Map<string, FoodItem>): MealPlan[] {
  return template.meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    ratio: meal.ratio,
    locked: false,
    entries: materializeTemplateEntries(meal.foods, foodsById, meal)
  }));
}

/** 同名模板检测（用于禁止重复创建）。 */
export function templateNameExists(templates: Array<{ name: string }>, name: string): boolean {
  return templates.some((template) => template.name === name);
}

// ---------------------------------------------------------------------------
// Supabase 行解析：写 v3，兼容旧 v2 与克重制 entries；旧克重仅在升级时丢弃。
// ---------------------------------------------------------------------------

interface TemplateRow {
  id: string | number;
  template_type?: string;
  name: string | number;
  payload: Record<string, unknown> | null;
  created_at?: string;
  schema_version?: number;
}

function supportsTemplatePayload(row: TemplateRow, payload: Record<string, unknown>) {
  if (payload.version === 3) return true;
  return payload.version == null && (row.schema_version == null || row.schema_version <= 2);
}

function parseFoodRefs(value: unknown): TemplateFoodRef[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const refs: TemplateFoodRef[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.foodId !== "string" || !item.foodId) {
      return null;
    }
    const foodSnapshot = parseFoodSnapshot(item.foodSnapshot);
    const customFood = item.customFood == null ? undefined : parseTemplateCustomFood(item.customFood);
    if ((item.foodSnapshot != null && !foodSnapshot) || (item.customFood != null && !customFood)) return null;
    refs.push({
      foodId: item.foodId,
      ...(foodSnapshot ? { foodSnapshot } : {}),
      ...(customFood ? { customFood } : {}),
    });
  }
  return refs;
}

export function mealTemplateFromRow(row: TemplateRow): MealTemplate | null {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  if (!supportsTemplatePayload(row, payload)) return null;
  const foods = parseFoodRefs(payload.foods ?? payload.entries);
  if (!foods) {
    return null; // 旧格式（entries 制）或损坏载荷：丢弃
  }
  return {
    id: String(row.id),
    name: String(row.name),
    foods,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : String(row.created_at ?? "")
  };
}

export function dayTemplateFromRow(row: TemplateRow): DayTemplate | null {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  if (!supportsTemplatePayload(row, payload) || !Array.isArray(payload.meals)) {
    return null;
  }
  const meals: DayTemplateMeal[] = [];
  for (const item of payload.meals as Array<Record<string, unknown>>) {
    const foods = parseFoodRefs(item?.foods ?? item?.entries);
    if (!foods) {
      return null; // 任一餐仍是旧 entries 制 → 整个模板按旧格式丢弃
    }
    meals.push({
      id: String(item.id ?? crypto.randomUUID()),
      name: String(item.name ?? "餐"),
      ratio: typeof item.ratio === "number" ? item.ratio : 0,
      foods
    });
  }
  return {
    id: String(row.id),
    name: String(row.name),
    meals,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : String(row.created_at ?? "")
  };
}

export function normalizeTemplates(templates: PlannerTemplates): PlannerTemplates {
  return {
    mealTemplates: templates.mealTemplates ?? [],
    dayTemplates: templates.dayTemplates ?? []
  };
}
