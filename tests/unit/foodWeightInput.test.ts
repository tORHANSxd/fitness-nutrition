import { describe, expect, it } from "vitest";
import { fromInputWeight, toInputWeight, getWeightInputBasis, formatFoodWeight } from "@/lib/foodWeights";
import { calculateFoodTotals } from "@/lib/nutrition";
import { confirmMealEvent, actualEntryTotals } from "@/lib/actualIntake";
import { parseMeals } from "@/lib/storageDocuments";
import { materializeTemplateEntries, mealTemplateFromRow, templateRefsFromEntries } from "@/lib/templates";
import type { FoodItem, MealFoodEntry, MealPlan } from "@/lib/types";

const rice: FoodItem = { id: "rice", name: "干米", category: "主食", carbsPer100g: 80, proteinPer100g: 8, fatPer100g: 1, kcalPer100g: 361, weightBasis: "raw", cookedRawRatio: 2.5, source: "user" };
const chicken: FoodItem = { ...rice, id: "chicken", name: "熟鸡胸", category: "肉类", carbsPer100g: 0, proteinPer100g: 30, fatPer100g: 3, kcalPer100g: 147, weightBasis: "cooked", cookedRawRatio: 0.66 };
const entry: MealFoodEntry = { id: "entry", foodId: rice.id, grams: 100, locked: false, minGrams: 80, maxGrams: 120, inputWeightBasis: "cooked" };
const meal: MealPlan = { id: "meal", name: "午餐", ratio: 1, locked: false, entries: [entry] };

describe("生熟称重输入与原营养基准", () => {
  it("100g生米对应250g熟饭；熟重输入100g只按40g生米计算", () => {
    expect(toInputWeight(rice, 100, entry)).toBe(250);
    expect(fromInputWeight(rice, 250, entry)).toBe(100);
    expect(fromInputWeight(rice, 100, entry)).toBe(40);
    expect(calculateFoodTotals(rice, fromInputWeight(rice, 100, entry)).carbs).toBe(32);
    expect(formatFoodWeight(rice, 100, entry)).toContain("生重约 100 g");
    expect(formatFoodWeight(rice, 100, entry)).toContain("熟重 250 g");
  });

  it("100g生鸡胸对应66g熟鸡胸，正反换算不反转出成率", () => {
    const selection = { inputWeightBasis: "raw" as const };
    expect(fromInputWeight(chicken, 100, selection)).toBe(66);
    expect(toInputWeight(chicken, 66, selection)).toBe(100);
    expect(calculateFoodTotals(chicken, fromInputWeight(chicken, 100, selection)).protein).toBeCloseTo(19.8);
  });

  it("切换仅改变输入单位，原克重、上下限、营养总量不变，显示不污染存储精度", () => {
    const base = 123.456789;
    expect(toInputWeight(rice, base, { inputWeightBasis: "raw" })).toBe(base);
    expect(fromInputWeight(rice, toInputWeight(rice, base, entry), entry)).toBeCloseTo(base, 12);
    expect(calculateFoodTotals(rice, base, entry)).toEqual(calculateFoodTotals(rice, base));
    expect(toInputWeight(rice, entry.minGrams!, entry)).toBe(200);
    expect(toInputWeight(rice, entry.maxGrams!, entry)).toBe(300);
  });

  it("按条目实测出成率换算；未知或无需区分的食物不会默认为1", () => {
    expect(toInputWeight(rice, 100, { ...entry, inputCookedRawRatio: 3 })).toBe(300);
    expect(getWeightInputBasis({ ...rice, cookedRawRatio: null }, entry)).toBe("raw");
    expect(getWeightInputBasis({ ...rice, weightBasis: "none" }, entry)).toBe("none");
    expect(formatFoodWeight({ ...rice, cookedRawRatio: null }, 100)).toContain("熟重待实测");
  });

  it("可食部只换算一次，确认实际摄入与计划营养相等", () => {
    const edibleEntry = { ...entry, useEdiblePortion: true, ediblePercent: 50 };
    const totals = calculateFoodTotals(rice, edibleEntry.grams, edibleEntry);
    expect(totals.carbs).toBe(40);
    const event = confirmMealEvent({ ...meal, entries: [edibleEntry] }, new Map([[rice.id, rice]]), { id: "event", timeZone: "Asia/Shanghai" });
    expect(event.actualFoodEntries[0].grams).toBe(50);
    expect(actualEntryTotals(event.actualFoodEntries[0])).toEqual(totals);
  });

  it("计划与模板往返保留称重标准及实测比率，旧条目仍可加载", () => {
    const selected = { ...entry, inputCookedRawRatio: 3 };
    expect(parseMeals(JSON.parse(JSON.stringify([{ ...meal, entries: [selected] }])))[0].entries[0]).toMatchObject(selected);
    const foods = new Map([[rice.id, rice]]);
    const refs = templateRefsFromEntries([selected], foods);
    const template = mealTemplateFromRow({ id: "template", name: "午餐", payload: { version: 3, foods: refs } });
    expect(materializeTemplateEntries(template!.foods, foods)[0]).toMatchObject({ inputWeightBasis: "cooked", inputCookedRawRatio: 3 });
    const old = { id: "old", foodId: rice.id, grams: 100, locked: false };
    expect(parseMeals([{ ...meal, entries: [old] }])[0].entries[0]).toMatchObject(old);
  });

  it.each([{ inputWeightBasis: "dry" }, { inputCookedRawRatio: 0 }, { inputCookedRawRatio: -1 }, { inputCookedRawRatio: "2.5" }, { inputCookedRawRatio: Infinity }])("拒绝非法持久化称重设置 %j", (selection) => {
    expect(() => parseMeals([{ ...meal, entries: [{ ...entry, ...selection }] }])).toThrow();
    expect(mealTemplateFromRow({ id: "invalid", name: "无效", payload: { version: 3, foods: [{ foodId: rice.id, ...selection }] } })).toBeNull();
  });
});
