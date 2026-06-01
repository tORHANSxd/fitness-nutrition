import type { FoodCategory, FoodItem, MealFoodEntry, PlannerTemplates } from "@/lib/types";

const templateCategoryOrder: FoodCategory[] = ["主食", "肉类", "蔬菜", "水果", "补剂", "坚果"];

export function buildAutoTemplateName(
  entries: MealFoodEntry[],
  foodsById: Map<string, FoodItem>,
  sequence: number,
  fallback: string
) {
  const names = templateCategoryOrder.flatMap((category) => {
    const food = entries.map((entry) => foodsById.get(entry.foodId)).find((item) => item?.category === category);
    return food ? [food.name] : [];
  });
  const baseName = names.length > 0 ? names.join("·") : fallback;
  return `${baseName} ${sequence}`;
}

export function normalizeTemplates(templates: PlannerTemplates): PlannerTemplates {
  return {
    mealTemplates: templates.mealTemplates ?? [],
    dayTemplates: templates.dayTemplates ?? []
  };
}
