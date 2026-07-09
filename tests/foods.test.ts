import { describe, expect, it } from "vitest";
import { builtinFoods, compareFoodsByCategoryThenName, createCustomFood, customFoodsFromMeals, sortFoods } from "@/lib/foods";
import { buildNutritionResult, round } from "@/lib/nutrition";
import { defaultProfile } from "@/lib/demoState";
import { foodCategories, type FoodItem, type MealPlan } from "@/lib/types";

function stub(category: FoodItem["category"], name: string): Pick<FoodItem, "category" | "name"> {
  return { category, name };
}

function pickById(id: string): FoodItem {
  const food = builtinFoods.find((item) => item.id === id);
  if (!food) {
    throw new Error(`builtin food not found: ${id}`);
  }
  return food;
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

  it("classifies cooking oil under the new 食物配料 category, sorted after all other categories", () => {
    expect(foodCategories).toContain("食物配料");
    // 食物配料排在分类序最后（选食面板/食物库都垫底）。
    expect(foodCategories[foodCategories.length - 1]).toBe("食物配料");

    const oil = builtinFoods.find((food) => food.id === "public-cooking-oil");
    expect(oil?.category).toBe("食物配料");

    // 排序上：配料类食物永远排在坚果之后。
    const sorted = sortFoods([pickById("public-cooking-oil"), pickById("public-almond"), pickById("public-rice-cooked")]);
    expect(sorted.map((food) => food.name)).toEqual(["白米饭", "杏仁", "食用油"]);
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

describe("custom ad-hoc foods in the meal plan", () => {
  it("creates a custom food with kcal auto-derived from macros (4/4/9)", () => {
    const food = createCustomFood({ name: "自制蛋白饼", category: "主食", carbsPer100g: 30, proteinPer100g: 20, fatPer100g: 5 });

    expect(food.id.startsWith("custom-")).toBe(true);
    expect(food.source).toBe("user");
    expect(food.category).toBe("主食");
    expect(round(food.kcalPer100g, 1)).toBe(30 * 4 + 20 * 4 + 5 * 9); // 245
  });

  it("defaults a blank name to 自定义食物", () => {
    const food = createCustomFood({ name: "   ", category: "肉类", carbsPer100g: 0, proteinPer100g: 25, fatPer100g: 3 });
    expect(food.name).toBe("自定义食物");
  });

  it("materializes embedded custom foods from meals so the solver can use them", () => {
    const custom = createCustomFood({ name: "自制酱牛肉", category: "肉类", carbsPer100g: 2, proteinPer100g: 28, fatPer100g: 6 });
    const meals: MealPlan[] = [
      {
        id: "lunch",
        name: "午餐",
        ratio: 1,
        locked: false,
        entries: [
          {
            id: "beef",
            foodId: custom.id,
            grams: 100,
            locked: false,
            minGrams: 0,
            maxGrams: 260,
            customFood: { name: custom.name, category: custom.category, carbsPer100g: 2, proteinPer100g: 28, fatPer100g: 6 }
          }
        ]
      }
    ];

    const extracted = customFoodsFromMeals(meals);
    expect(extracted).toHaveLength(1);
    expect(extracted[0].id).toBe(custom.id);
    expect(round(extracted[0].kcalPer100g, 1)).toBe(2 * 4 + 28 * 4 + 6 * 9); // 174

    // 求解与总量计算走同一条食物解析链：合并后 buildNutritionResult 能算出该餐当前总量。
    const result = buildNutritionResult(
      { ...defaultProfile, planDate: "2026-07-09" },
      meals,
      [...builtinFoods, ...extracted]
    );
    expect(round(result.actualTotals.kcal, 0)).toBe(174);
    expect(round(result.actualTotals.protein, 1)).toBe(28);
  });
});
