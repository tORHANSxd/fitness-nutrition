// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtinFoods } from "@/lib/foods";
import { chinaFoodCatalog, chinaCompositionFoods, chinaFoodId, chinaFoodSource, chinaFoodToFoodItem, chinaFoodUnavailableReason, matchesFoodSearch, parseChinaNutrient } from "@/lib/chinaFoodComposition";
import { attachFoodSnapshots, foodFromSnapshot, parseFoodSnapshot } from "@/lib/foodSnapshots";
import { calculateMealsTotals, getFoodPortionRule } from "@/lib/nutrition";
import { foodCategories, type MealPlan } from "@/lib/types";

const original = JSON.parse(readFileSync("public/data/china-food-composition.json", "utf8"));
const rowByCode = (code: string) => chinaFoodCatalog.find((row) => row.foodCode === code)!;

describe("China food composition integration", () => {
  it("retains every original record and separates incomplete data without inventing zeros", () => {
    expect(original.commit).toBe(chinaFoodSource.commit);
    expect(original.records).toHaveLength(1677);
    expect(chinaFoodCatalog).toHaveLength(1677);
    expect(new Set(chinaFoodCatalog.map((row) => row.foodCode)).size).toBe(1677);
    expect(new Set(chinaFoodCatalog.map((row) => row.group)).size).toBe(61);
    expect(chinaFoodCatalog.filter((row) => row.englishName)).toHaveLength(1242);
    expect(chinaCompositionFoods).toHaveLength(1349);
    expect(chinaFoodCatalog.filter((row) => chinaFoodUnavailableReason(row))).toHaveLength(328);
    expect(builtinFoods).toHaveLength(32 + 1349);
    const sourceByCode = new Map<string, Record<string, string>>(original.records.map((row: Record<string, string>) => [row.foodCode, row]));
    for (const row of chinaFoodCatalog) {
      const { category, ...fields } = row;
      expect(foodCategories).toContain(category);
      expect(sourceByCode.get(row.foodCode)).toMatchObject(fields);
    }
    expect(chinaFoodToFoodItem(rowByCode("219037"))).toBeNull();
    expect(chinaFoodUnavailableReason(rowByCode("192011"))).toContain("缺少");
  });

  it("distinguishes zero, trace, annotated values and unknown values", () => {
    expect(parseChinaNutrient("0.0")).toBe(0);
    expect(parseChinaNutrient("Tr")).toBe(0);
    expect(parseChinaNutrient("899*")).toBe(899);
    for (const value of ["", "—", "un", "unknown", "NaN", "Infinity", "-1", "1.2abc"]) expect(parseChinaNutrient(value)).toBeNull();
  });

  it("subtracts fiber once, keeps edible weights and source energy separate, and scales a meal correctly", () => {
    const soy = chinaFoodToFoodItem(rowByCode("031101"))!;
    expect(soy).toMatchObject({ carbsPer100g: 18.7, proteinPer100g: 35, fatPer100g: 16, kcalPer100g: 358.8, weightBasis: "none", cookedRawRatio: null });
    const meals: MealPlan[] = [{ id: "meal", name: "午餐", ratio: 1, locked: false, entries: [{ id: "entry", foodId: soy.id, grams: 200, locked: false }] }];
    expect(calculateMealsTotals(meals, builtinFoods)).toEqual({ kcal: 717.6, carbs: 37.4, protein: 70, fat: 32 });
    const fruit = chinaFoodCatalog.find((row) => row.category === "水果" && Number(row.edible) < 100 && !chinaFoodUnavailableReason(row))!;
    expect(chinaFoodToFoodItem(fruit)!.proteinPer100g).toBe(parseChinaNutrient(fruit.protein));
    expect(chinaFoodToFoodItem({ ...rowByCode("031101"), dietaryFiber: "90" })).toBeNull();
    expect(chinaFoodToFoodItem({ ...rowByCode("031101"), dietaryFiber: "—" })).toBeNull();
  });

  it("preserves stable legacy IDs and snapshots for every added category", () => {
    expect(builtinFoods[0].id).toBe("public-rice-cooked");
    expect(builtinFoods.find((food) => food.id === "public-chicken-breast-cooked")).toMatchObject({ proteinPer100g: 30.76, weightBasis: "cooked" });
    expect(new Set(builtinFoods.map((food) => food.id)).size).toBe(builtinFoods.length);
    for (const category of ["豆类", "乳制品", "其他"] as const) {
      const food = chinaCompositionFoods.find((item) => item.category === category)!;
      const meals: MealPlan[] = [{ id: "meal", name: "午餐", ratio: 1, locked: false, entries: [{ id: "entry", foodId: food.id, grams: 100, locked: false }] }];
      const snapshot = attachFoodSnapshots(meals, new Map([[food.id, food]]))[0].entries[0].foodSnapshot!;
      expect(parseFoodSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
      expect(foodFromSnapshot(food.id, snapshot)).toMatchObject({ category, carbsPer100g: food.carbsPer100g });
      expect(Number.isFinite(getFoodPortionRule(food).maxGrams)).toBe(true);
    }
  });

  it("searches Chinese aliases, English names and original codes", () => {
    const soy = chinaFoodToFoodItem(rowByCode("031101"))!;
    expect(matchesFoodSearch(soy, "大豆")).toBe(true);
    expect(matchesFoodSearch(soy, "031101")).toBe(true);
    expect(matchesFoodSearch(soy, "soybean")).toBe(true);
    expect(matchesFoodSearch(soy, "not a food")).toBe(false);
    expect(matchesFoodSearch({ id: "user-food", name: "自制餐" }, "自制")).toBe(true);
    expect(chinaFoodId("091101x")).toBe("public-cfcd6-091101x");
  });

  it("preserves all independent GI entries and original markers", () => {
    const gi = JSON.parse(readFileSync("public/data/china-food-gi.json", "utf8"));
    expect(gi.commit).toBe(chinaFoodSource.commit);
    expect(gi.groups).toHaveLength(11);
    const rows = gi.groups.flatMap((group: { list: unknown[] }) => group.list);
    expect(rows).toHaveLength(259);
    expect(rows[0]).toEqual({ index: 1, foodName: "葡萄糖", GI: 100 });
  });
});
