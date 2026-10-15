import { expect, it } from "vitest";
import { parseNutritionStandard } from "@/lib/nutritionStandard";
import { syntheticStandard } from "../fixtures/nutritionStandardFixture";

it("个人标准只作为草案解析，默认关闭周期并保留三餐份额", () => {
  const proposal = parseNutritionStandard(syntheticStandard);
  expect(proposal.policy.energy).toEqual({ kind: "fixed_kcal", kcal: 2200 });
  expect(proposal.meals.map(m => m.kind)).toEqual(["main", "snack", "main"]);
  expect(proposal.foodPattern.fiber).toEqual([25, 35]);
  expect(() => parseNutritionStandard({ ...syntheticStandard, optionalCarbCycle: { ...syntheticStandard.optionalCarbCycle, enabled: true } })).toThrow("默认关闭");
  expect(() => parseNutritionStandard({ ...syntheticStandard, dailyTarget: { ...syntheticStandard.dailyTarget, carbs: 0 } })).toThrow("不一致");
});
