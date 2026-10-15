import { foodCategories, type FoodItem, type FoodSnapshot, type MealFoodEntry, type MealPlan, type WeightBasis } from "@/lib/types";
import { isEdiblePercent } from "@/lib/foodWeights";
import { foodNutritionMetadata, macroEnergyPer100g, parseFoodNutritionMetadata } from "@/lib/foodNutrition";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isWeightBasis(value: unknown): value is WeightBasis {
  return value === "raw" || value === "cooked" || value === "none";
}

export function parseFoodSnapshot(value: unknown): FoodSnapshot | null {
  if (!isRecord(value)
    || (value.version !== 1 && value.version !== 2)
    || typeof value.name !== "string"
    || !(foodCategories as readonly unknown[]).includes(value.category)
    || !isNonNegativeNumber(value.kcalPer100g)
    || !isNonNegativeNumber(value.carbsPer100g)
    || !isNonNegativeNumber(value.proteinPer100g)
    || !isNonNegativeNumber(value.fatPer100g)
    || !isWeightBasis(value.weightBasis)
    || (value.ediblePercent != null && !isEdiblePercent(value.ediblePercent))
    || !(value.cookedRawRatio == null || (typeof value.cookedRawRatio === "number" && Number.isFinite(value.cookedRawRatio) && value.cookedRawRatio > 0))) {
    return null;
  }

  const common = {
    name: value.name,
    category: value.category as FoodItem["category"],
    kcalPer100g: value.kcalPer100g,
    carbsPer100g: value.carbsPer100g,
    proteinPer100g: value.proteinPer100g,
    fatPer100g: value.fatPer100g,
    weightBasis: value.weightBasis,
    cookedRawRatio: value.cookedRawRatio as number | null ?? null,
    ...(isEdiblePercent(value.ediblePercent) ? { ediblePercent: value.ediblePercent } : {}),
  };
  if (value.version === 1) return { ...common, version: 1 };
  const metadata = parseFoodNutritionMetadata(value);
  const macroKcalPer100g = macroEnergyPer100g(common);
  if (!metadata || value.energyPolicyVersion !== "food-energy-v2" || typeof value.macroKcalPer100g !== "number"
    || Math.abs(value.macroKcalPer100g - macroKcalPer100g) > 1e-6
    || (metadata.effectiveEnergyBasis === "label" && metadata.sourceKcalPer100g !== common.kcalPer100g)) return null;
  return { ...common, ...metadata, version: 2, energyPolicyVersion: "food-energy-v2", macroKcalPer100g };
}

export function foodSnapshotFromFood(food: FoodItem): FoodSnapshot {
  return {
    version: 2,
    energyPolicyVersion: "food-energy-v2",
    ...foodNutritionMetadata(food),
    macroKcalPer100g: macroEnergyPer100g(food),
    name: food.name,
    category: food.category,
    kcalPer100g: food.kcalPer100g,
    carbsPer100g: food.carbsPer100g,
    proteinPer100g: food.proteinPer100g,
    fatPer100g: food.fatPer100g,
    weightBasis: food.weightBasis,
    cookedRawRatio: food.cookedRawRatio ?? null,
    ...(isEdiblePercent(food.ediblePercent) ? { ediblePercent: food.ediblePercent } : {}),
  };
}

export function foodFromSnapshot(foodId: string, snapshot: FoodSnapshot): FoodItem {
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
    ...foodNutritionMetadata(snapshot.version === 2 ? snapshot : {}),
    ...(isEdiblePercent(snapshot.ediblePercent) ? { ediblePercent: snapshot.ediblePercent } : {}),
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
  const snapshot = parseFoodSnapshot(entry.foodSnapshot);
  if (snapshot) return { status: "snapshot" as const, food: foodFromSnapshot(entry.foodId, snapshot) };
  const liveFood = foodsById.get(entry.foodId) ?? customFoodFromEntry(entry);
  if (liveFood) return { status: "live" as const, food: liveFood };

  return { status: "unresolved" as const, food: null };
}

export function attachFoodSnapshots(meals: MealPlan[], foodsById: ReadonlyMap<string, FoodItem>): MealPlan[] {
  return meals.map((meal) => ({
    ...meal,
    entries: meal.entries.map((entry) => {
      if (parseFoodSnapshot(entry.foodSnapshot)) return entry;
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
