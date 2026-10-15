import type { FoodItem, MealFoodEntry, WeightBasis } from "@/lib/types";

type WeightFood = Pick<FoodItem, "weightBasis" | "cookedRawRatio">;
type WeightInput = Pick<MealFoodEntry, "inputWeightBasis" | "inputCookedRawRatio">;

export function weightInputSelection(value: Record<string, unknown>): WeightInput {
  if (value.inputWeightBasis != null && value.inputWeightBasis !== "raw" && value.inputWeightBasis !== "cooked")
    throw new Error("食物称重计算标准无效。");
  if (value.inputCookedRawRatio != null && (typeof value.inputCookedRawRatio !== "number" || !Number.isFinite(value.inputCookedRawRatio) || value.inputCookedRawRatio <= 0))
    throw new Error("熟生比必须为有限正数。");
  return {
    ...(value.inputWeightBasis != null ? { inputWeightBasis: value.inputWeightBasis as "raw" | "cooked" } : {}),
    ...(value.inputCookedRawRatio != null ? { inputCookedRawRatio: value.inputCookedRawRatio as number } : {}),
  };
}

export function getCookedRawRatio(food: WeightFood, selection?: WeightInput): number | null {
  const ratio = selection?.inputCookedRawRatio ?? food.cookedRawRatio;
  return typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function getWeightInputBasis(food: WeightFood, selection?: WeightInput): WeightBasis {
  return food.weightBasis !== "none" && getCookedRawRatio(food, selection) != null
    ? selection?.inputWeightBasis ?? food.weightBasis
    : food.weightBasis;
}

export function toInputWeight(food: WeightFood, grams: number, selection?: WeightInput): number {
  if (getWeightInputBasis(food, selection) === food.weightBasis) return grams;
  const ratio = getCookedRawRatio(food, selection)!;
  return food.weightBasis === "raw" ? grams * ratio : grams / ratio;
}

export function fromInputWeight(food: WeightFood, grams: number, selection?: WeightInput): number {
  if (getWeightInputBasis(food, selection) === food.weightBasis) return grams;
  const ratio = getCookedRawRatio(food, selection)!;
  return food.weightBasis === "raw" ? grams / ratio : grams * ratio;
}

export function formatFoodWeight(food: WeightFood, grams: number, selection?: WeightInput): string {
  const display = (value: number) => Math.round(value * 10) / 10;
  if (food.weightBasis === "none") return `食用重 ${display(grams)} g`;
  const ratio = getCookedRawRatio(food, selection);
  if (ratio == null) return food.weightBasis === "raw"
    ? `生重 ${display(grams)} g · 熟重待实测`
    : `生重待实测 · 熟重 ${display(grams)} g`;
  const raw = food.weightBasis === "raw" ? grams : grams / ratio;
  const cooked = food.weightBasis === "cooked" ? grams : grams * ratio;
  const basis = getWeightInputBasis(food, selection);
  return `生重${basis === "raw" ? "" : "约"} ${display(raw)} g · 熟重${basis === "cooked" ? "" : "约"} ${display(cooked)} g`;
}

type EdibleSelection = Pick<
  MealFoodEntry,
  "useEdiblePortion" | "ediblePercent"
>;

export function isEdiblePercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100
  );
}

export function edibleSelection(
  value: Record<string, unknown>,
): EdibleSelection {
  if (
    value.useEdiblePortion != null &&
    typeof value.useEdiblePortion !== "boolean"
  )
    throw new Error("可食部选项无效。");
  if (
    (value.ediblePercent != null && !isEdiblePercent(value.ediblePercent)) ||
    (value.useEdiblePortion === true && !isEdiblePercent(value.ediblePercent))
  )
    throw new Error("请填写大于 0、不超过 100 的可食部比例。");
  return {
    ...(value.useEdiblePortion != null
      ? { useEdiblePortion: value.useEdiblePortion as boolean }
      : {}),
    ...(isEdiblePercent(value.ediblePercent)
      ? { ediblePercent: value.ediblePercent }
      : {}),
  };
}

export function edibleGrams(
  grams: number,
  selection?: EdibleSelection,
): number {
  if (!selection?.useEdiblePortion) return grams;
  if (!isEdiblePercent(selection.ediblePercent))
    throw new Error("缺少有效的可食部比例。");
  return (grams * selection.ediblePercent) / 100;
}
