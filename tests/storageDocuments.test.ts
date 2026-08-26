import { describe, expect, it } from "vitest";
import { createStarterMeals, defaultProfile } from "@/lib/demoState";
import { builtinFoods } from "@/lib/foods";
import { buildNutritionResult } from "@/lib/nutrition";
import { parseDailyCheckinActual, parsePlannerDraftRow, parseSavedPlanRow } from "@/lib/storageDocuments";

describe("versioned storage documents", () => {
  it("migrates a legacy plan while stripping deprecated and unknown fields", () => {
    const meals = createStarterMeals(defaultProfile);
    const result = buildNutritionResult(defaultProfile, meals, builtinFoods);
    const plan = parseSavedPlanRow({
      id: "plan-1",
      plan_date: defaultProfile.planDate,
      profile: { ...defaultProfile, proteinPerKg: 2.2, workoutType: "legacy", ignored: true },
      meals,
      result: { ...result, carbDayType: "legacy", ignored: true },
      created_at: "2026-08-26T00:00:00Z",
      updated_at: "2026-08-26T00:00:00Z",
      schema_version: 1,
      integrity_flags: []
    });

    expect(plan.schemaVersion).toBe(1);
    expect(plan.profile).not.toHaveProperty("proteinPerKg");
    expect(plan.profile).not.toHaveProperty("workoutType");
    expect(plan.result).not.toHaveProperty("carbDayType");
    expect(plan.result).not.toHaveProperty("ignored");
  });

  it("rejects future plan and planner draft versions", () => {
    const meals = createStarterMeals(defaultProfile);
    const result = buildNutritionResult(defaultProfile, meals, builtinFoods);
    expect(() => parseSavedPlanRow({
      id: "future",
      plan_date: defaultProfile.planDate,
      profile: defaultProfile,
      meals,
      result,
      schema_version: 3
    })).toThrow("不支持的每日计划版本");
    expect(() => parsePlannerDraftRow({
      profile_snapshot: defaultProfile,
      meals,
      revision: 1,
      schema_version: 3
    })).toThrow("云端草稿版本无效");
  });

  it("upgrades legacy daily check-ins to v2 without inventing food detail", () => {
    const actual = parseDailyCheckinActual(
      { kcal: 1800, carbs: 200, protein: 130, fat: 55, unknown: "drop" },
      { water_liters: 2.5, steps: 8000 },
      "2026-08-26"
    );

    expect(actual).toMatchObject({
      version: 2,
      foods: [],
      exercises: [],
      totalsSnapshot: { kcal: 1800, carbs: 200, protein: 130, fat: 55 },
      habits: { waterLiters: 2.5, steps: 8000 }
    });
    expect(actual).not.toHaveProperty("unknown");
    expect(() => parseDailyCheckinActual({ version: 3 }, {}, "2026-08-26")).toThrow("不支持的每日实际记录版本");
  });

  it("does not merge obsolete columns into an already-versioned v2 check-in", () => {
    const actual = parseDailyCheckinActual(
      { version: 2, foods: [], exercises: [], bmrKcal: 1500, activityKcal: 300 },
      { water_liters: 0, steps: 0 },
      "2026-08-26"
    );
    expect(actual).not.toHaveProperty("habits");
  });
});
