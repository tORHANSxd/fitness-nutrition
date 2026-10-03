import { describe, expect, it } from "vitest";
import { allocateMealLayout, configureMealLayout, mealLayoutDraft } from "@/lib/mealLayout";
import { buildNutritionResult, createDefaultMeals } from "@/lib/nutrition";
import { defaultProfile } from "@/lib/demoState";
import { targetForAllocation } from "@/lib/planProtocol";

const daily = { kcal: 2205, protein: 175, carbs: 230, fat: 65 };
const slots = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `meal-${i}`, name: ` 自定餐 ${i + 1} `, weights: { protein: i + 1, carbs: count - i, fat: 1 } }));

describe("自定义分餐纯计算", () => {
  it.each([1, 2, 3, 4, 5, 12])("%i 餐独立分配，4/4/9 和全天三大营养素守恒", count => {
    const result = allocateMealLayout(slots(count), daily);
    const totals = result.map(m => targetForAllocation(daily, m.targetAllocation));
    for (const key of ["protein", "carbs", "fat", "kcal"] as const) expect(totals.reduce((sum, target) => sum + target[key], 0)).toBeCloseTo(daily[key], 8);
    expect(result.reduce((sum, m) => sum + m.ratio, 0)).toBeCloseTo(1, 8);
    expect(result[0].name).toBe("自定餐 1");
    expect(totals[0].fat).toBeCloseTo(65 / count, 8);
  });

  it("非法餐数、名称、标识与份额拒绝应用", () => {
    for (const count of [0, 13]) expect(() => allocateMealLayout(slots(count), daily)).toThrow("1–12");
    for (const weights of [{ protein: -1, carbs: 1, fat: 1 }, { protein: NaN, carbs: 1, fat: 1 }, { protein: 0, carbs: 1, fat: 1 }]) expect(() => allocateMealLayout([{ ...slots(1)[0], weights }], daily)).toThrow();
    for (const name of [" ", "餐".repeat(81)]) expect(() => allocateMealLayout([{ ...slots(1)[0], name }], daily)).toThrow("餐名");
    expect(() => allocateMealLayout([slots(1)[0], slots(1)[0]], daily)).toThrow("标识");
  });

  it("减少餐数保留所有食物条目的克重、锁定、上下限和餐时，输入不变", () => {
    const meals = configureMealLayout([], slots(4), daily);
    meals[0].schedule = { start: "12:00", end: "12:30", endDayOffset: 0 };
    meals[3].entries = [{ id: "entry", foodId: "synthetic", grams: 123, locked: true, minGrams: 20, maxGrams: 200 }];
    const before = structuredClone(meals);
    const next = configureMealLayout(meals, mealLayoutDraft(meals).slice(0, 2), daily);
    expect(next).toHaveLength(2);
    expect(next[1].entries).toEqual(before[3].entries);
    expect(next[0].schedule).toEqual(before[0].schedule);
    expect(meals).toEqual(before);
  });

  it("锁定餐可改名，但不能被删除、重新分配或接收移入食品", () => {
    const meals = configureMealLayout([], slots(3), daily);
    meals[0].locked = true;
    const renamed = mealLayoutDraft(meals); renamed[0].name = "保留目标";
    expect(configureMealLayout(meals, renamed, daily)[0].name).toBe("保留目标");
    expect(() => configureMealLayout(meals, renamed.slice(1), daily)).toThrow("解锁");
    expect(() => configureMealLayout(meals, renamed.slice(0, 2), daily)).toThrow("解锁");
    meals[0].locked = false; meals[1].locked = true;
    meals[2].entries = [{ id: "entry", foodId: "synthetic", grams: 100, locked: false }];
    const kept = mealLayoutDraft(meals).slice(0, 2); kept[0].weights = { protein: 1 - meals[1].targetAllocation!.protein, carbs: 1 - meals[1].targetAllocation!.carbs, fat: 1 - meals[1].targetAllocation!.fat };
    expect(() => configureMealLayout(meals, kept, daily)).toThrow("接收");
  });

  it("旧每日目标也可显式分餐，体重更新后按同一比例计算而不重置餐名或份额", () => {
    const profile = { ...defaultProfile, allocationMode: "explicitMacros" as const };
    const meals = configureMealLayout(createDefaultMeals(profile), slots(5), daily);
    const before = buildNutritionResult(profile, meals, []);
    const after = buildNutritionResult({ ...profile, weightKg: profile.weightKg + 10 }, meals, []);
    for (const result of [before, after]) for (const key of ["protein", "carbs", "fat", "kcal"] as const) expect(result.mealRecommendations.reduce((sum, m) => sum + m.target[key], 0)).toBeCloseTo(result.dailyTarget[key], 6);
    expect(after.mealRecommendations[0].target.protein).toBeCloseTo(after.dailyTarget.protein / 15);
    expect(after.dailyTarget).not.toEqual(before.dailyTarget);
  });
});
