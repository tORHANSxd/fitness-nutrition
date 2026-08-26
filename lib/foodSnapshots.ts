import { foodCategories, type FoodItem, type FoodSnapshotV1, type MealFoodEntry, type MealPlan, type WeightBasis } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isWeightBasis(value: unknown): value is WeightBasis {
  return value === "raw" || value === "cooked" || value === "none";
}

export function parseFoodSnapshot(value: unknown): FoodSnapshotV1 | null {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.name !== "string"
    || !(foodCategories as readonly unknown[]).includes(value.category)
    || !isNonNegativeNumber(value.kcalPer100g)
    || !isNonNegativeNumber(value.carbsPer100g)
    || !isNonNegativeNumber(value.proteinPer100g)
    || !isNonNegativeNumber(value.fatPer100g)
    || !isWeightBasis(value.weightBasis)
    || !(value.cookedRawRatio == null || (typeof value.cookedRawRatio === "number" && Number.isFinite(value.cookedRawRatio) && value.cookedRawRatio > 0))) {
    return null;
  }

  return {
    version: 1,
    name: value.name,
    category: value.category as FoodItem["category"],
    kcalPer100g: value.kcalPer100g,
    carbsPer100g: value.carbsPer100g,
    proteinPer100g: value.proteinPer100g,
    fatPer100g: value.fatPer100g,
    weightBasis: value.weightBasis,
    cookedRawRatio: value.cookedRawRatio ?? null,
  };
}

export function foodSnapshotFromFood(food: FoodItem): FoodSnapshotV1 {
  return {
    version: 1,
    name: food.name,
    category: food.category,
    kcalPer100g: food.kcalPer100g,
    carbsPer100g: food.carbsPer100g,
    proteinPer100g: food.proteinPer100g,
    fatPer100g: food.fatPer100g,
    weightBasis: food.weightBasis,
    cookedRawRatio: food.cookedRawRatio ?? null,
  };
}

export function foodFromSnapshot(foodId: string, snapshot: FoodSnapshotV1): FoodItem {
  return {
    id: foodId,
    name: snapshot.name,
    category: snapshot.category,
    kcalPer100g: snapshot.kcalPer100g,
    carbsPer100g: snapshot.carbsPer100g,
    proteinPer100g: snapshot.proteinPer100g,
    fatPer100g: snapshot.fatPer100g,
    weightBasis: snapshot.weightBasis,
    cookedRawRatio: snapshot.cookedRawRatio,
    source: "user",
  };
}

function customFoodFromEntry(entry: MealFoodEntry): FoodItem | null {
  if (!entry.customFood) return null;
  const custom = entry.customFood;
  return {
    id: entry.foodId,
    name: custom.name.trim() || "自定义食物",
    category: custom.category,
    kcalPer100g: custom.carbsPer100g * 4 + custom.proteinPer100g * 4 + custom.fatPer100g * 9,
    carbsPer100g: custom.carbsPer100g,
    proteinPer100g: custom.proteinPer100g,
    fatPer100g: custom.fatPer100g,
    weightBasis: "none",
    cookedRawRatio: null,
    source: "user",
  };
}

export function resolveMealFood(entry: MealFoodEntry, foodsById: ReadonlyMap<string, FoodItem>) {
  const liveFood = foodsById.get(entry.foodId) ?? customFoodFromEntry(entry);
  if (liveFood) return { status: "live" as const, food: liveFood };

  const snapshot = parseFoodSnapshot(entry.foodSnapshot);
  if (snapshot) return { status: "snapshot" as const, food: foodFromSnapshot(entry.foodId, snapshot) };

  return { status: "unresolved" as const, food: null };
}

export function attachFoodSnapshots(meals: MealPlan[], foodsById: ReadonlyMap<string, FoodItem>): MealPlan[] {
  return meals.map((meal) => ({
    ...meal,
    entries: meal.entries.map((entry) => {
      const resolved = resolveMealFood(entry, foodsById);
      return resolved.food
        ? { ...entry, foodSnapshot: foodSnapshotFromFood(resolved.food) }
        : entry;
    }),
  }));
}

export function unresolvedFoodFlags(meals: MealPlan[], foodsById: ReadonlyMap<string, FoodItem>): string[] {
  const ids = new Set<string>();
  for (const meal of meals) {
    for (const entry of meal.entries) {
      if (resolveMealFood(entry, foodsById).status === "unresolved") ids.add(entry.foodId);
    }
  }
  return Array.from(ids, (id) => `unresolved_food_ref:${id}`).sort();
}
