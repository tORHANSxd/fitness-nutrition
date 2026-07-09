import { describe, expect, it } from "vitest";
import { builtinFoods, createCustomFood } from "@/lib/foods";
import { buildTemplateName, dayTemplateFromRow, materializeTemplateEntries, mealTemplateFromRow, templateNameExists } from "@/lib/templates";
import type { TemplateFoodRef } from "@/lib/types";

const foodsById = new Map(builtinFoods.map((food) => [food.id, food]));

describe("template naming (v2: foods only, no sequence number)", () => {
  it("joins food names with · sorted by category then pinyin, without a trailing number", () => {
    const refs: TemplateFoodRef[] = [
      { foodId: "public-chicken-breast-cooked" }, // 肉类 鸡胸肉
      { foodId: "public-oats-raw" }, // 主食 燕麦片
      { foodId: "public-rice-cooked" }, // 主食 白米饭
      { foodId: "public-broccoli-cooked" } // 蔬菜 西兰花
    ];

    // 分类序：主食(白米饭<燕麦片 按拼音) → 蔬菜(西兰花) → 肉类(鸡胸肉)；结尾无编号。
    expect(buildTemplateName(refs, foodsById)).toBe("白米饭·燕麦片·西兰花·鸡胸肉");
  });

  it("dedupes repeated foods and includes embedded custom foods by their own name/category", () => {
    const refs: TemplateFoodRef[] = [
      { foodId: "public-rice-cooked" },
      { foodId: "public-rice-cooked" }, // 重复
      { foodId: "custom-abc", customFood: { name: "自制酱牛肉", category: "肉类", carbsPer100g: 2, proteinPer100g: 28, fatPer100g: 6 } }
    ];

    expect(buildTemplateName(refs, foodsById)).toBe("白米饭·自制酱牛肉");
  });

  it("falls back for an empty food list", () => {
    expect(buildTemplateName([], foodsById)).toBe("空模板");
  });

  it("detects duplicate template names so creation can be blocked", () => {
    const existing = [{ name: "白米饭·鸡胸肉" }];
    expect(templateNameExists(existing, "白米饭·鸡胸肉")).toBe(true);
    expect(templateNameExists(existing, "白米饭·西兰花·鸡胸肉")).toBe(false);
  });
});

describe("materializing template entries (weights are NOT stored)", () => {
  it("creates entries at category default grams, skipping unknown foods", () => {
    const refs: TemplateFoodRef[] = [
      { foodId: "public-rice-cooked" }, // 主食 默认 180g
      { foodId: "missing-food" },
      { foodId: "public-cooking-oil" } // 食用油 默认 10g
    ];

    const entries = materializeTemplateEntries(refs, foodsById);
    expect(entries).toHaveLength(2);
    expect(entries[0].foodId).toBe("public-rice-cooked");
    expect(entries[0].grams).toBe(180);
    expect(entries[0].locked).toBe(false);
    expect(entries[1].grams).toBe(10);
    expect(entries[1].maxGrams).toBe(20);
  });

  it("re-instantiates embedded custom foods with their macro payload", () => {
    const custom = createCustomFood({ name: "自制蛋白饼", category: "主食", carbsPer100g: 30, proteinPer100g: 20, fatPer100g: 5 });
    const refs: TemplateFoodRef[] = [
      { foodId: custom.id, customFood: { name: custom.name, category: "主食", carbsPer100g: 30, proteinPer100g: 20, fatPer100g: 5 } }
    ];

    const entries = materializeTemplateEntries(refs, foodsById);
    expect(entries).toHaveLength(1);
    expect(entries[0].customFood?.name).toBe("自制蛋白饼");
    expect(entries[0].grams).toBe(180); // 主食分类默认克重
  });
});

describe("template row parsing (v2 only, legacy rows are dropped)", () => {
  it("parses a v2 meal template payload", () => {
    const template = mealTemplateFromRow({
      id: "row-1",
      template_type: "meal",
      name: "白米饭·鸡胸肉",
      payload: { foods: [{ foodId: "public-rice-cooked" }, { foodId: "public-chicken-breast-cooked" }], createdAt: "2026-07-09T00:00:00Z" }
    });

    expect(template?.name).toBe("白米饭·鸡胸肉");
    expect(template?.foods.map((ref) => ref.foodId)).toEqual(["public-rice-cooked", "public-chicken-breast-cooked"]);
  });

  it("drops legacy gram-based meal/day templates", () => {
    expect(
      mealTemplateFromRow({
        id: "row-legacy",
        template_type: "meal",
        name: "旧模板 3",
        payload: { entries: [{ id: "e", foodId: "public-rice-cooked", grams: 200, locked: false }], mealRatio: 0.3 }
      })
    ).toBeNull();

    expect(
      dayTemplateFromRow({
        id: "row-legacy-day",
        template_type: "day",
        name: "旧全天 1",
        payload: { meals: [{ id: "breakfast", name: "早餐", ratio: 0.3, locked: false, entries: [] }] }
      })
    ).toBeNull();
  });

  it("parses a v2 day template payload (meals keep id/name/ratio but only food refs)", () => {
    const template = dayTemplateFromRow({
      id: "row-2",
      template_type: "day",
      name: "白米饭·鸡胸肉",
      payload: {
        meals: [{ id: "lunch", name: "午餐", ratio: 0.5, foods: [{ foodId: "public-rice-cooked" }] }],
        createdAt: "2026-07-09T00:00:00Z"
      }
    });

    expect(template?.meals).toHaveLength(1);
    expect(template?.meals[0].foods[0].foodId).toBe("public-rice-cooked");
    expect(template?.meals[0].ratio).toBe(0.5);
  });
});
