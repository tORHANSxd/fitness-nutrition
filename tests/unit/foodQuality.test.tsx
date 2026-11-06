import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FoodQualityDetails } from "@/components/FoodQualityDetails";
import { summarizeFoodQuality } from "@/lib/foodNutrition";
import { foodSnapshotFromFood, resolveMealFood } from "@/lib/foodSnapshots";
import type { FoodItem } from "@/lib/types";

afterEach(cleanup);
const grain: FoodItem = { id: "grain", name: "合成主食", category: "主食", source: "user", weightBasis: "cooked", cookedRawRatio: null, kcalPer100g: 150, carbsPer100g: 20, proteinPer100g: 5, fatPer100g: 2, fiberPer100g: 3, carbohydrateBasis: "available_excluding_fiber", effectiveEnergyBasis: "label", sourceKcalPer100g: 150 };
const soy: FoodItem = { ...grain, id: "soy", name: "合成豆类", category: "豆类", proteinPer100g: 20, fiberPer100g: null, carbohydrateBasis: "unknown", effectiveEnergyBasis: "macros" };

it("植物蛋白全部计入，零克不制造缺失，未知纤维不记零，来源能量口径独立", () => {
  const portions = [{ food: grain, grams: 200 }, { food: soy, grams: 150 }, { food: null, grams: 0 }];
  expect(summarizeFoodQuality(portions)).toEqual({ protein: 40, proteinByCategory: { 主食: 10, 豆类: 30 }, fiberGrams: 6, unknownFiberItems: 1, unknownCarbBasisItems: 1, sourceEnergyItems: 1, macroEnergyItems: 1, missingFoods: 0 });
  render(<FoodQualityDetails label="当前计划" portions={portions} />);
  fireEvent.click(screen.getByText("当前计划：蛋白质来源与营养口径"));
  expect(screen.getByText(/总蛋白质 40.0 g/)).toBeVisible();
  expect(screen.getByText(/1 项未知，为部分合计/)).toBeVisible();
  expect(screen.getByText(/不设统一“吸收折扣”/)).toBeVisible();
});

it("源库变化不改历史食品构成，缺食品与历史汇总明确显示部分统计", () => {
  const entry = { id: "entry", foodId: grain.id, grams: 100, locked: false, foodSnapshot: foodSnapshotFromFood(grain) };
  const resolved = resolveMealFood(entry, new Map([[grain.id, { ...grain, proteinPer100g: 50 }]])).food;
  const portions = [{ food: resolved, grams: 100 }, { food: null, grams: 30 }];
  expect(summarizeFoodQuality(portions)).toMatchObject({ protein: 5, missingFoods: 1, unknownFiberItems: 1 });
  render(<FoodQualityDetails label="已记录实际" portions={portions} partial />);
  fireEvent.click(screen.getByText("已记录实际：蛋白质来源与营养口径"));
  expect(screen.getByText(/仅统计具备食品明细的部分/)).toBeVisible();
});
