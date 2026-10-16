import type { FoodItem, FoodNutritionMetadata, MealPlan } from "@/lib/types";
import { edibleGrams } from "@/lib/foodWeights";

type NutrientFood = Pick<FoodItem, "carbsPer100g" | "proteinPer100g" | "fatPer100g"> & Partial<FoodNutritionMetadata>;

export const macroEnergyPer100g = (food: NutrientFood) => food.carbsPer100g * 4 + food.proteinPer100g * 4 + food.fatPer100g * 9;

export function energyPer100g(food: NutrientFood): number {
  return food.effectiveEnergyBasis === "label" && food.sourceKcalPer100g != null
    ? food.sourceKcalPer100g : macroEnergyPer100g(food);
}

export function foodNutritionMetadata(food: Partial<FoodNutritionMetadata>): FoodNutritionMetadata {
  return {
    sourceKcalPer100g: food.sourceKcalPer100g ?? null,
    sourceEnergyMethod: food.sourceEnergyMethod ?? "legacy_unknown",
    effectiveEnergyBasis: food.effectiveEnergyBasis ?? "macros",
    sourceQuality: food.sourceQuality ?? "unverified",
    carbohydrateBasis: food.carbohydrateBasis ?? "unknown",
    sourceCarbsPer100g: food.sourceCarbsPer100g ?? null,
    fiberPer100g: food.fiberPer100g ?? null,
    portionPolicy: food.portionPolicy ?? "food",
  };
}

export function parseFoodNutritionMetadata(value: Record<string, unknown>): FoodNutritionMetadata | null {
  const nullable = (n: unknown) => n == null || (typeof n === "number" && Number.isFinite(n) && n >= 0);
  if (![value.sourceKcalPer100g, value.sourceCarbsPer100g, value.fiberPer100g].every(nullable)) return null;
  const metadata = foodNutritionMetadata(value as Partial<FoodNutritionMetadata>);
  if (!["product_label", "food_composition", "recipe", "macro_estimate", "legacy_unknown"].includes(metadata.sourceEnergyMethod)
    || !["label", "macros"].includes(metadata.effectiveEnergyBasis)
    || !["verified_label", "matched_reference", "recipe_estimate", "unverified"].includes(metadata.sourceQuality)
    || !["available_excluding_fiber", "total_including_fiber", "net_declared", "unknown"].includes(metadata.carbohydrateBasis)
    || !["food", "fixed_dose"].includes(metadata.portionPolicy)
    || (metadata.effectiveEnergyBasis === "label" && metadata.sourceKcalPer100g == null)
    || (metadata.carbohydrateBasis === "total_including_fiber" && metadata.sourceCarbsPer100g != null && metadata.fiberPer100g != null && metadata.fiberPer100g > metadata.sourceCarbsPer100g)) return null;
  return metadata;
}

export function foodMetadataToRow(food: Partial<FoodNutritionMetadata>) {
  const m = foodNutritionMetadata(food);
  return { source_kcal_per_100g: m.sourceKcalPer100g == null ? null : Math.round(m.sourceKcalPer100g * 100) / 100, source_energy_method: m.sourceEnergyMethod,
    effective_energy_basis: m.effectiveEnergyBasis, source_quality: m.sourceQuality,
    carbohydrate_basis: m.carbohydrateBasis, source_carbs_per_100g: m.sourceCarbsPer100g,
    fiber_per_100g: m.fiberPer100g, portion_policy: m.portionPolicy };
}

export function foodMetadataFromRow(row: Record<string, unknown>): FoodNutritionMetadata {
  const metadata = parseFoodNutritionMetadata({ sourceKcalPer100g: row.source_kcal_per_100g,
    sourceEnergyMethod: row.source_energy_method, effectiveEnergyBasis: row.effective_energy_basis,
    sourceQuality: row.source_quality, carbohydrateBasis: row.carbohydrate_basis,
    sourceCarbsPer100g: row.source_carbs_per_100g, fiberPer100g: row.fiber_per_100g, portionPolicy: row.portion_policy });
  if (!metadata) throw new Error("食品来源、热量或纤维数据无效。");
  return metadata;
}

export const isFixedDose = (food: Pick<FoodItem, "category" | "portionPolicy">) => food.portionPolicy === "fixed_dose";

export function fiberSummary(meals: MealPlan[], resolve: (entry: MealPlan["entries"][number]) => FoodItem | null) {
  let knownGrams = 0, unknownItems = 0;
  for (const entry of meals.flatMap(meal => meal.entries)) {
    if (entry.grams <= 0) continue;
    const food = resolve(entry);
    if (food?.fiberPer100g == null) unknownItems++;
    else knownGrams += food.fiberPer100g * edibleGrams(entry.grams, entry) / 100;
  }
  return { knownGrams, unknownItems, complete: unknownItems === 0 };
}
