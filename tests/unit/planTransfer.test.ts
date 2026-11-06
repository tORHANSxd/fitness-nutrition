import { expect, it } from "vitest";
import { emptyProfile } from "@/lib/demoState";
import { createTreProtocol } from "@/lib/planPresets";
import { protocolMeals } from "@/lib/planProtocol";
import { buildNutritionResult } from "@/lib/nutrition";
import { exportPlanDocument, importPlanDocument } from "@/lib/planTransfer";
import type { UserProfile } from "@/lib/types";
import { flexibleBody, flexiblePolicy } from "../fixtures/flexibleNutritionFixture";
import { createNutritionSnapshot } from "@/lib/nutritionGoals/snapshot";

const protocol = createTreProtocol({ id: "30000000-0000-4000-8000-000000000001", effectiveFrom: "2030-01-01", cycleAnchorDate: "2030-01-01", timeZone: "Asia/Shanghai" });
const profile: UserProfile = { ...emptyProfile, planDate: "2030-01-01", targetMode: "calibrated", allocationMode: "explicitMacros", protocolSnapshot: protocol, scheduleOverride: { trainingStartLocal: "17:30" } };
const meals = protocolMeals(protocol);
const result = buildNutritionResult(profile, meals, []);
it("D01 plan JSON roundtrip preserves protocol, business date, meal clocks and macro allocations", () => {
  const loaded = importPlanDocument(exportPlanDocument(profile, meals, result, new Map()));
  expect(loaded.profile).toEqual(profile); expect(loaded.meals).toEqual(meals); expect(loaded.result).toEqual(result);
});
it("D12 rejects unknown versions, wrong dates and oversized files without rewriting them", () => {
  const text = exportPlanDocument(profile, meals, result, new Map()); const raw = JSON.parse(text);
  raw.version = 99; expect(() => importPlanDocument(JSON.stringify(raw))).toThrow("版本");
  raw.version = 1; raw.plan.plan_date = "2030-01-02"; expect(() => importPlanDocument(JSON.stringify(raw))).toThrow("日期");
  expect(() => importPlanDocument(" ".repeat(262145))).toThrow("256 KiB");
  expect(() => exportPlanDocument({ ...profile, targetKcal: Infinity }, meals, result, new Map())).toThrow();
});

it("新算法与当天身体输入、剩余脂肪规则完整往返", () => {
  const next = createTreProtocol({ id: "30000000-0000-4000-8000-000000000002", effectiveFrom: profile.planDate, cycleAnchorDate: profile.planDate, timeZone: "Asia/Shanghai", nutrition: createNutritionSnapshot(flexiblePolicy(), flexibleBody) });
  const adjusted: UserProfile = { ...profile, protocolSnapshot: next, dailyEnergyAdjustment: { targetKcal: 2200, macroInputs: { version: 1, weightKg: 88, bodyFatPct: 20, protein: { kind: "ffm", coefficient: 2.5 }, carbs: { kind: "body_weight", coefficient: 3 }, fat: { kind: "residual" } } } };
  const nextMeals = protocolMeals(next), nextResult = buildNutritionResult(adjusted, nextMeals, []);
  const loaded = importPlanDocument(exportPlanDocument(adjusted, nextMeals, nextResult, new Map()));
  expect(loaded.profile).toEqual(adjusted);
  expect(loaded.result.dailyTarget).toEqual(nextResult.dailyTarget);
  expect(loaded.profile.protocolSnapshot?.nutrition?.result.algorithmVersion).toBe("nutrition-v5.1");
});
