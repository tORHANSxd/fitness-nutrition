import type { MealFoodEntry } from "@/lib/types";

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
