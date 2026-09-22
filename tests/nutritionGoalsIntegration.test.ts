import { describe, expect, it } from "vitest";
import { syntheticBody, syntheticGoalProtocol, syntheticPolicy } from "./helpers/nutritionGoalFixture";
import { calculateNutritionTarget } from "@/lib/nutritionGoals/calculator";
import { resolveCalculationBodySnapshot } from "@/lib/nutritionGoals/bodySnapshot";
import { createNutritionSnapshot } from "@/lib/nutritionGoals/snapshot";
import { goalPresets } from "@/lib/nutritionGoals/presets";
import { createTreProtocol } from "@/lib/planPresets";
import { parsePlanProtocol, protocolMeals } from "@/lib/planProtocol";
import { normalizeNutritionResult, normalizeUserProfile, parseSavedPlanRow, parsePlannerDraftRow } from "@/lib/storageDocuments";
import { buildNutritionResult, calculateDailyTarget } from "@/lib/nutrition";
import { exportPlanDocument, importPlanDocument } from "@/lib/planTransfer";
import { mergeLatestBodyMetrics } from "@/lib/bodyLogs";
import { emptyProfile } from "@/lib/demoState";
import { aggregateHeatmap, buildHeatmapDays } from "@/lib/heatmap";
import { emptyActualV3, normalizeActualV3 } from "@/lib/actualIntake";
import type { DailyCheckin, UserProfile } from "@/lib/types";

const protocol = syntheticGoalProtocol();
const profile: UserProfile = { ...emptyProfile, planDate: "2026-01-01", targetMode: "calibrated", allocationMode: "explicitMacros", protocolSnapshot: protocol, carbTaperSteps: [{ date: "2025-12-01", deltaKcal: -300 }] };
const meals = protocolMeals(protocol);
const result = buildNutritionResult(profile, meals, []);
describe("v5 snapshots through existing v4 storage boundaries", () => {
  it("D03 changing active picker defaults never changes the reader of saved presetVersion 1", () => {
    const original = goalPresets.cut_recomp;
    try {
      Object.defineProperty(goalPresets, "cut_recomp", { value: { ...original, proteinPerKg: 2.1 }, configurable: true, enumerable: true });
      expect(parsePlanProtocol(JSON.parse(JSON.stringify(protocol)))).toEqual(protocol);
    } finally { Object.defineProperty(goalPresets, "cut_recomp", { value: original, configurable: true, enumerable: true }); }
    const unsupported = structuredClone(protocol);
    unsupported.nutrition!.policy.presetVersion = 2 as 1;
    try { parsePlanProtocol(unsupported); throw new Error("future version should fail"); }
    catch (error) { expect((error as { rawDocument: unknown }).rawDocument).toEqual(unsupported); }
  });
  it("normalizes, hydrates drafts, maps history, exports/imports without losing evidence or old steps", () => {
    expect(normalizeUserProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
    expect(normalizeNutritionResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
    const row = { id: "synthetic-plan", plan_date: profile.planDate, profile, meals, result, schema_version: 3, algorithm_version: "nutrition-v5.0", created_at: "", updated_at: "", integrity_flags: [] };
    expect(parseSavedPlanRow(row).profile.protocolSnapshot).toEqual(protocol);
    expect(parsePlannerDraftRow({ plan_date: profile.planDate, profile_snapshot: profile, meals, schema_version: 3, revision: 1 }).profile.protocolSnapshot).toEqual(protocol);
    const imported = importPlanDocument(exportPlanDocument(profile, meals, result, new Map()));
    expect(imported.profile).toEqual(profile); expect(imported.result).toEqual(result); expect(imported.meals).toEqual(meals);
  });
  it("a new measurement generates only a candidate and changing schedule preserves E/P/F/C", () => {
    const changed = mergeLatestBodyMetrics(profile, [{ logDate: "2026-01-02", weightKg: 88, bodyFatPct: 19.9 }]);
    expect(calculateDailyTarget(changed)).toEqual(protocol.dailyTarget);
    expect(calculateNutritionTarget(syntheticPolicy(), { ...syntheticBody, weightKg: 88 }).resolvedTarget).not.toEqual(protocol.dailyTarget);
    expect(calculateDailyTarget({ ...changed, trainingTime: "rest", scheduleOverride: { trainingStartLocal: "19:00", eatingWindow: { start: "12:00", end: "22:00", endDayOffset: 0 } } })).toEqual(protocol.dailyTarget);
    expect(profile.protocolSnapshot).toEqual(protocol);
  });
  it("future/unknown versions and forged resolved targets cannot be silently saved", () => {
    const future = { ...protocol, schemaVersion: 99 };
    expect(() => parsePlanProtocol(future)).toThrow(/版本/);
    const changed = structuredClone(protocol); changed.nutrition!.result.resolvedTarget!.kcal += 25;
    expect(() => parsePlanProtocol(changed)).toThrow(/快照/);
    expect(() => parsePlanProtocol({ ...protocol, schemaVersion: 1 })).toThrow(/旧协议/);
    expect(() => parseSavedPlanRow({ plan_date: profile.planDate, profile, meals, result: { ...result, targetResolution: undefined }, schema_version: 3 })).toThrow(/不一致/);
  });
  it("old fixed 2205 and legacy steps remain intact", () => {
    const fixed = createTreProtocol({ id: "20000000-0000-4000-8000-000000000050", effectiveFrom: profile.planDate, cycleAnchorDate: profile.planDate, timeZone: "Asia/Shanghai" });
    expect(parsePlanProtocol(JSON.parse(JSON.stringify(fixed)))).toEqual(fixed);
    expect(calculateDailyTarget({ ...profile, protocolSnapshot: fixed })).toEqual({ kcal: 2205, protein: 175, fat: 65, carbs: 230 });
    expect(profile.carbTaperSteps).toEqual([{ date: "2025-12-01", deltaKcal: -300 }]);
  });
  it("deduplicates 7-day weights, excludes future data, requires explicit morning confirmation", () => {
    const body = { ...syntheticBody, calculationDate: "2026-01-07" };
    const logs = [1, 2, 3, 4].map(day => ({ logDate: `2026-01-0${day}`, weightKg: 80 }));
    logs.push({ logDate: "2026-01-04", weightKg: 84 }, { logDate: "2026-01-08", weightKg: 200 });
    expect(resolveCalculationBodySnapshot(body, logs, false)).toEqual(body);
    const resolved = resolveCalculationBodySnapshot(body, logs, true);
    expect(resolved.weightKg).toBe(81); expect(resolved.weightDates).toHaveLength(4); expect(resolved.weightSource).toBe("seven_day_mean");
    expect(resolveCalculationBodySnapshot(body, logs.slice(0, 3), true)).toEqual(body);
    expect(calculateNutritionTarget(syntheticPolicy(), { ...resolved, weightDates: ["2026-01-01", "2026-01-01"] }).status).toBe("needs_input");
  });
  it("rejects misleading preset labels and unknown inactive methods", () => {
    expect(calculateNutritionTarget({ ...syntheticPolicy(), presetDeltaRatio: 0 }, syntheticBody).issues[0].code).toBe("PRESET_OVERRIDE_REQUIRES_CUSTOM");
    const manual = { ...syntheticPolicy(), presetId: "custom" as const, energy: { kind: "fixed_kcal" as const, kcal: 2400 }, rmr: { kind: "not_a_method" as "not_used" } };
    expect(calculateNutritionTarget(manual, syntheticBody).status).toBe("infeasible");
  });
  it("food solving and locked meals cannot redefine the frozen daily or meal targets", () => {
    const lockedMeals = meals.map(m => ({ ...m, locked: true }));
    const output = buildNutritionResult({ ...profile, weightKg: 200 }, lockedMeals, []);
    expect(output.dailyTarget).toEqual(protocol.dailyTarget);
    expect(output.mealRecommendations.map(m => m.target)).toEqual(result.mealRecommendations.map(m => m.target));
    expect(output.conflicts.length).toBeGreaterThan(0);
  });
  it("actual source survives normalization, heatmap uses total TDEE exactly once", () => {
    const actual = normalizeActualV3({ ...emptyActualV3(), intakeComplete: true, targetProtocolSnapshot: protocol, exercises: [{ id: "run", name: "合成运动", kcal: 400 }] });
    expect(actual.targetProtocolSnapshot).toEqual(protocol);
    const checkin: DailyCheckin = { id: "synthetic-checkin", planDate: profile.planDate, actual, target: protocol.dailyTarget, completed: true, createdAt: "", updatedAt: "" };
    const days = buildHeatmapDays({ plans: [], checkins: [checkin], foods: [], today: profile.planDate, includeIncomplete: false });
    expect(aggregateHeatmap(days, "kcal").net).toBe(-2820);
    expect(aggregateHeatmap(days, "kcal").tiles.some(t => t.id.startsWith("exercise:"))).toBe(false);
    const manualPolicy = { ...syntheticPolicy(), presetId: "custom" as const, energy: { kind: "fixed_kcal" as const, kcal: 2400 } };
    const snapshot = createNutritionSnapshot(manualPolicy, syntheticBody);
    const unknown = { ...days[0], expenditure: snapshot.result.expenditure };
    expect(aggregateHeatmap([unknown], "kcal").expenditureIncomplete).toBe(true);
  });
});
