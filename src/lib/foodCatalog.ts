import { compareFoodsByCategoryThenName } from "@/lib/foods";
import { getChinaFoodSummary } from "@/lib/chinaFoodComposition";
import type { FoodItem } from "@/lib/types";

// Confirmed equivalents only. Cooked meats/vegetables and branded products are
// deliberately not matched to raw ingredients or a different product.
export const publicFoodReplacements: Readonly<Record<string, string>> = {
  "public-rice-cooked": "public-cfcd6-012401x",
  "public-cucumber-raw": "public-cfcd6-043208",
  "public-banana-raw": "public-cfcd6-065033",
  "public-apple-raw": "public-cfcd6-061101x",
  "public-orange-raw": "public-cfcd6-064101",
  "public-kiwi-raw": "public-cfcd6-063909",
  "public-egg-whole": "public-cfcd6-111101x",
  "public-almond": "public-cfcd6-071014",
  "public-walnut": "public-cfcd6-071004",
  "public-peanut": "public-cfcd6-072004",
};

export function isReferenceFood(food: Pick<FoodItem, "id">): boolean {
  return getChinaFoodSummary(food.id) != null;
}

export function selectableFoodCatalog(
  foods: FoodItem[],
  includeReference = true,
): FoodItem[] {
  const ids = new Set(foods.map((food) => food.id));
  return foods
    .filter((food) => {
      if (food.source === "user" || food.isUserOverride) return true;
      if (
        publicFoodReplacements[food.id] &&
        ids.has(publicFoodReplacements[food.id])
      )
        return false;
      return includeReference || !isReferenceFood(food);
    })
    .sort((a, b) => {
      const rank = (food: FoodItem) =>
        food.source === "user" ? 0 : food.isUserOverride ? 1 : 2;
      return rank(a) - rank(b) || compareFoodsByCategoryThenName(a, b);
    });
}
