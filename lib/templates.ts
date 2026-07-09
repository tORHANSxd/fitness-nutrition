import { createCustomFood, sortFoods } from "@/lib/foods";
import { getDefaultMealEntrySettings } from "@/lib/nutrition";
import type {
  DayTemplate,
  DayTemplateMeal,
  FoodItem,
  MealFoodEntry,
  MealPlan,
  MealTemplate,
  PlannerTemplates,
  TemplateFoodRef
} from "@/lib/types";

// ---------------------------------------------------------------------------
// 模板 v2：只记录「哪些食物」（TemplateFoodRef），不记录克重。
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
export function templateRefsFromEntries(entries: MealFoodEntry[]): TemplateFoodRef[] {
  return entries.map((entry) => (entry.customFood ? { foodId: entry.foodId, customFood: entry.customFood } : { foodId: entry.foodId }));
}

/** 应用模板：为每个食物引用生成条目，克重取分类默认值；解析不到的引用跳过。 */
export function materializeTemplateEntries(
  refs: TemplateFoodRef[],
  foodsById: Map<string, FoodItem>,
  meal?: Pick<MealPlan, "id" | "name">
): MealFoodEntry[] {
  return refs.flatMap((ref) => {
    const food = resolveTemplateFood(ref, foodsById);
    if (!food) {
      return [];
    }
    const defaults = getDefaultMealEntrySettings(food, meal);
    return [
      {
        id: crypto.randomUUID(),
        foodId: ref.foodId,
        grams: defaults.grams,
        locked: false,
        minGrams: defaults.minGrams,
        maxGrams: defaults.maxGrams,
        ...(ref.customFood ? { customFood: ref.customFood } : {})
      }
    ];
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
// Supabase 行解析：仅接受 v2 载荷（payload.foods / payload.meals[].foods）。
// 旧克重制模板（payload.entries / meals[].entries）一律丢弃——下次保存整组替换时自动清库。
// ---------------------------------------------------------------------------

interface TemplateRow {
  id: string | number;
  template_type?: string;
  name: string | number;
  payload: Record<string, unknown> | null;
  created_at?: string;
}

function parseFoodRefs(value: unknown): TemplateFoodRef[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const refs: TemplateFoodRef[] = [];
  for (const item of value as Array<Record<string, unknown>>) {
    if (!item || typeof item.foodId !== "string") {
      return null;
    }
    refs.push(
      item.customFood ? { foodId: item.foodId, customFood: item.customFood as TemplateFoodRef["customFood"] } : { foodId: item.foodId }
    );
  }
  return refs;
}

export function mealTemplateFromRow(row: TemplateRow): MealTemplate | null {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const foods = parseFoodRefs(payload.foods);
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
  if (!Array.isArray(payload.meals)) {
    return null;
  }
  const meals: DayTemplateMeal[] = [];
  for (const item of payload.meals as Array<Record<string, unknown>>) {
    const foods = parseFoodRefs(item?.foods);
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
