// @vitest-environment node
import { describe, expect, it } from "vitest";
import vectors from "../04_nutrition_formula_test_vectors.json";
import { calculateNutritionTarget, ceilToStep, roundToStep } from "@/lib/nutritionGoals/calculator";
import { createNutritionPolicy } from "@/lib/nutritionGoals/presets";
import type { CalculationBodySnapshot, GoalPresetId, NutritionPolicyV1 } from "@/lib/nutritionGoals/types";

const baseBody: CalculationBodySnapshot = { calculationDate: "2026-01-15", timeZone: "Asia/Shanghai", scope: { adultAttested: true }, recovery: "unknown" };
const manual = (): NutritionPolicyV1 => ({ ...createNutritionPolicy("custom"), rmr: { kind: "not_used" }, tdee: { kind: "not_used" }, energy: { kind: "fixed_kcal", kcal: 2205 }, protein: { kind: "fixed_grams", grams: 175 }, fat: { kind: "fixed_grams", grams: 65 } });
const ordinary = () => ({ ...createNutritionPolicy("maintain"), tdee: { kind: "pal_total", multiplier: 1.5, includesExercise: true } } as NutritionPolicyV1);
const ordinaryBody = (): CalculationBodySnapshot => ({ ...baseBody, weightKg: 70, heightCm: 175, ageYears: 30, calculationSex: "male" });

/** The supplied JSON is a separate acceptance oracle, never changed to fit the implementation. */
function adaptVector(v: (typeof vectors.numericCases)[number]) {
  const i = v.input as Record<string, number | string | boolean | number[] | Record<string, number> | undefined>;
  const n = (key: string) => i[key] as number;
  const body: CalculationBodySnapshot = { ...baseBody, weightKg: i.weightKg as number | undefined, heightCm: i.heightCm as number | undefined, ageYears: i.ageYears as number | undefined, calculationSex: i.calculationSex as "male" | "female" | undefined };
  const policy = manual();
  if (i.presetId) Object.assign(policy, createNutritionPolicy(i.presetId as GoalPresetId), { tdee: { kind: "pal_total", multiplier: n("activityMultiplier"), includesExercise: true }, energy: { kind: "percent", deltaRatio: n("energyDeltaRatio") } });
  if (i.targetKcal != null) policy.energy = { kind: "fixed_kcal", kcal: n("targetKcal") };
  if (i.proteinCoefficient != null) policy.protein = { kind: "body_weight", coefficient: n("proteinCoefficient") };
  if (i.fatCoefficient != null) policy.fat = { kind: "body_weight", coefficient: n("fatCoefficient"), minimumEnergyShare: 0.2 };
  if (i.proteinG != null) policy.protein = { kind: "fixed_grams", grams: n("proteinG") };
  if (i.fatG != null) policy.fat = { kind: "fixed_grams", grams: n("fatG") };
  if (i.bodyFatPct != null) Object.assign(body, { ffmInput: "body_fat", bodyFatPct: n("bodyFatPct"), bodyFatWeightKg: n("weightKg"), bodyFatMeasuredOn: baseBody.calculationDate, bodyFatSource: "合成BIA测试" });
  if (v.kind === "rmr") Object.assign(policy, { rmr: { kind: "cunningham_1980" }, tdee: { kind: "pal_total", multiplier: 1.5, includesExercise: true }, energy: { kind: "percent", deltaRatio: 0 } });
  if (v.kind === "from_macros") Object.assign(policy, { energy: { kind: "from_macros" }, carbs: { kind: "fixed_grams", grams: n("carbsG") } });
  if (v.kind === "tdee_component") Object.assign(policy, {
    rmr: { kind: "measured", kcal: n("rmrKcal"), sourceLabel: "合成间接测热测试", measuredOn: baseBody.calculationDate },
    tdee: { kind: "non_exercise_plus_planned", multiplier: n("nonExerciseMultiplier"), cycleDays: n("cycleDays"), netExercise: (i.plannedNetExerciseKcal as number[]).map((kcal, index) => ({ id: `event-${index}`, kcal })), netConfirmed: true }, energy: { kind: "percent", deltaRatio: 0 },
  });
  if (v.kind === "tdee_manual") Object.assign(policy, { tdee: { kind: "manual", kcal: n("tdeeKcal"), source: "user_estimate" }, energy: { kind: "percent", deltaRatio: n("energyDeltaRatio") } });
  if (v.kind === "manual_percent_fat") policy.fat = { kind: "energy_share", share: n("fatShare") };
  if (v.kind === "ffm_protein") policy.protein = { kind: "ffm", coefficient: n("proteinCoefficientFfm"), contextConfirmed: i.leanResistanceCutConfirmed === true };
  return { policy, body };
}

describe("04: independent numeric acceptance vectors", () => {
  it.each(vectors.numericCases)("$id $kind", (vector) => {
    let actual: Record<string, unknown>;
    if (vector.kind === "rounding") {
      const i = vector.input as { proteinRawG: number; fatRawG: number; energyRawKcal: number };
      actual = { proteinG: roundToStep(i.proteinRawG, 5), fatG: ceilToStep(i.fatRawG, 5), energyKcal: roundToStep(i.energyRawKcal, 25) };
    } else {
      const { policy, body } = adaptVector(vector);
      const result = calculateNutritionTarget(policy, body);
      expect(result.status, JSON.stringify(result.issues)).toBe("valid");
      const target = result.resolvedTarget!;
      actual = { ...result.expenditure, ...result.rawValues, energyKcal: target.kcal, proteinG: target.protein, fatG: target.fat, carbsG: target.carbs };
      expect(Math.abs(target.kcal - (4 * target.protein + 9 * target.fat + 4 * target.carbs))).toBeLessThanOrEqual(vectors.mathTolerance);
      expect(result.inputFingerprint).toMatch(/^fnv1a64:/);
    }
    for (const [key, expected] of Object.entries(vector.expected)) {
      if (typeof expected === "number") expect(Math.abs(Number(actual[key]) - expected), key).toBeLessThanOrEqual(vectors.mathTolerance);
      else expect(actual[key], key).toBe(expected);
    }
  });
});

describe("04: executable contract scenarios", () => {
  it.each(vectors.contractCases)("$id $inputCase", (vector) => {
    let policy = manual(), body = { ...baseBody };
    switch (vector.id) {
      case "X01": policy = { ...policy, energy: { kind: "fixed_kcal", kcal: 1600 }, protein: { kind: "fixed_grams", grams: 300 }, fat: { kind: "fixed_grams", grams: 60 } }; break;
      case "X02": policy = { ...ordinary(), rmr: { kind: "cunningham_1980" } }; body = ordinaryBody(); break;
      case "X03": policy = { ...ordinary(), tdee: { kind: "pal_total", multiplier: 1.5, includesExercise: true, exerciseKcal: 400 } as unknown as NutritionPolicyV1["tdee"] }; body = ordinaryBody(); break;
      case "X04": policy = { ...policy, carbTaperSteps: [{ date: "2026-01-01", deltaKcal: -300 }] } as NutritionPolicyV1; break;
      case "X05": policy = ordinary(); body = ordinaryBody(); break;
      case "X06": body = { ...body, ageYears: 17 }; break;
      case "X07": policy = ordinary(); body = { ...body, weightKg: 70 }; break;
      case "X08": policy = { ...policy, energy: { kind: "fixed_kcal", kcal: 2200 }, carbs: { kind: "fixed_grams", grams: 230 } }; break;
      case "X09": policy = { ...policy, energy: { kind: "fixed_kcal", kcal: NaN } }; break;
      case "X10": policy = { ...policy, tdee: { kind: "manual", kcal: 1200, source: "user_estimate" }, energy: { kind: "percent", deltaRatio: 0 }, protein: { kind: "fixed_grams", grams: 80 }, fat: { kind: "fixed_grams", grams: 40 } }; break;
      case "X11": policy = ordinary(); body = { ...ordinaryBody(), bodyFatPct: 20.1 }; break;
      case "X12": policy = ordinary(); body = ordinaryBody(); break;
    }
    const result = calculateNutritionTarget(policy, body);
    expect(result.status, JSON.stringify(result.issues)).toBe(vector.expectedState);
    if ("expectedCode" in vector) expect(result.issues.map(i => i.code)).toContain(vector.expectedCode);
    if (vector.id === "X04") expect(result.resolvedTarget?.kcal).toBe(vector.expectedEnergyKcal);
    if (vector.id === "X10") { expect(result.resolvedTarget).toBeNull(); expect(result.candidateTarget?.kcal).toBe(1200); }
    if (vector.id === "X11") expect(calculateNutritionTarget(policy, { ...body, bodyFatPct: 19.9 }).resolvedTarget?.protein).toBe(result.resolvedTarget?.protein);
    if (vector.id === "X12") {
      const frozen = structuredClone(result);
      const candidate = calculateNutritionTarget(policy, { ...body, weightKg: 72 });
      expect(candidate.resolvedTarget).not.toEqual(frozen.resolvedTarget);
      expect(result).toEqual(frozen); // Persistence/hydration behaviour also tested in the integration suite.
    }
  });
  it.each([NaN, Infinity, -Infinity, "", -1])("rejects invalid number %s without coercing or clamping", value => {
    const result = calculateNutritionTarget({ ...manual(), energy: { kind: "fixed_kcal", kcal: value as number } }, baseBody);
    expect(result.status).toBe("infeasible"); expect(result.issues[0].code).toBe("INVALID_NUMBER");
  });
  it("manual decimals stay exact, fat +10g leaves carbohydrate -22.5g", () => {
    const policy = { ...manual(), energy: { kind: "fixed_kcal", kcal: 2205.25 }, protein: { kind: "fixed_grams", grams: 175.2 } } as NutritionPolicyV1;
    const a = calculateNutritionTarget(policy, baseBody).resolvedTarget!;
    const b = calculateNutritionTarget({ ...policy, fat: { kind: "fixed_grams", grams: 75 } }, baseBody).resolvedTarget!;
    expect(a.kcal).toBe(2205.25); expect(a.protein).toBe(175.2); expect(b.carbs - a.carbs).toBe(-22.5);
  });
  it("all five presets have the requested energy direction and never clamp protein", () => {
    const targets = ["cut_recomp", "cut_lean", "recomp", "lean_gain", "maintain"].map(id => calculateNutritionTarget({ ...createNutritionPolicy(id as GoalPresetId), tdee: ordinary().tdee }, ordinaryBody()).resolvedTarget!.kcal);
    expect(targets[0]).toBeLessThan(targets[1]); expect(targets[1]).toBeLessThan(targets[2]); expect(targets[2]).toBe(targets[4]); expect(targets[3]).toBeGreaterThan(targets[4]);
    const high = calculateNutritionTarget({ ...manual(), energy: { kind: "fixed_kcal", kcal: 4000 }, protein: { kind: "body_weight", coefficient: 4 } }, { ...ordinaryBody(), weightKg: 90 });
    expect(high.status).toBe("requires_review"); expect(high.candidateTarget?.protein).toBe(360);
  });
  it("requires FFM context, a dated source, valid dates, unique net events and adult confirmation", () => {
    const bodies: CalculationBodySnapshot[] = [{ ...baseBody, scope: { adultAttested: false } }, { ...baseBody, scope: { adultAttested: true, pregnantOrLactating: true } }, { ...baseBody, calculationDate: "2026-02-30" }];
    expect(bodies.map(b => calculateNutritionTarget(manual(), b).status)).toEqual(["requires_review", "out_of_scope", "infeasible"]);
    expect(calculateNutritionTarget({ ...manual(), protein: { kind: "ffm", coefficient: 2.6, contextConfirmed: true } }, ordinaryBody()).issues[0].code).toBe("FFM_REQUIRED");
    expect(calculateNutritionTarget({ ...ordinary(), tdee: { kind: "non_exercise_plus_planned", multiplier: 1.3, cycleDays: 8, netConfirmed: true, netExercise: [{ id: "a", kcal: 300 }, { id: "a", kcal: 300 }] } }, ordinaryBody()).issues[0].code).toBe("DUPLICATE_EXERCISE");
  });
});
