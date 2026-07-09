import { describe, expect, it } from "vitest";
import { builtinFoods, compareFoodsByCategoryThenName, sortFoods } from "@/lib/foods";
import { foodCategories, type FoodItem } from "@/lib/types";

function stub(category: FoodItem["category"], name: string): Pick<FoodItem, "category" | "name"> {
  return { category, name };
}

describe("food sorting", () => {
  it("orders first by category (foodCategories order), then by pinyin name", () => {
    const input = [
      stub("主食", "燕麦片"), // yan
      stub("水果", "苹果"), // ping
      stub("主食", "白米饭"), // bai
      stub("肉类", "鸡胸肉") // ji
    ];

    // 主食(0) 内部按拼音 bai<yan（不是 Unicode 码点：燕 71D5 < 白 767D），随后 水果(2)、肉类(3)。
    expect(sortFoods(input).map((food) => food.name)).toEqual(["白米饭", "燕麦片", "苹果", "鸡胸肉"]);
  });

  it("returns a new array without mutating the input", () => {
    const input = [stub("肉类", "鸡胸肉"), stub("主食", "白米饭")];
    const sorted = sortFoods(input);

    expect(sorted).not.toBe(input);
    expect(input.map((food) => food.name)).toEqual(["鸡胸肉", "白米饭"]); // 原数组顺序不变
  });

  it("pushes unknown categories to the end", () => {
    const input = [
      stub("未知类" as FoodItem["category"], "神秘食物"),
      stub("主食", "白米饭")
    ];

    expect(sortFoods(input).map((food) => food.name)).toEqual(["白米饭", "神秘食物"]);
  });

  it("keeps the built-in food library grouped by category order", () => {
    const sortedCategories = sortFoods(builtinFoods).map((food) => food.category);
    const firstIndexByCategory = new Map<string, number>();
    sortedCategories.forEach((category, index) => {
      if (!firstIndexByCategory.has(category)) {
        firstIndexByCategory.set(category, index);
      }
    });
    // 每个分类只出现在一段连续区间：其首次出现下标按 foodCategories 顺序单调递增。
    const appearanceOrder = Array.from(firstIndexByCategory.keys());
    expect(appearanceOrder).toEqual(foodCategories.filter((category) => firstIndexByCategory.has(category)));
  });
});
