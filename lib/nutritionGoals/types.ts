import type { MacroTotals } from "@/lib/types";

export type GoalPresetId = "cut_recomp" | "cut_lean" | "recomp" | "lean_gain" | "maintain" | "custom";
export type RmrMethod = { kind: "mifflin_st_jeor" | "cunningham_1980" | "not_used" }
  | { kind: "measured"; kcal: number; measuredOn: string; sourceLabel: string };
export type TdeeMethod = { kind: "pal_total"; multiplier: number | null; includesExercise: true }
  | { kind: "non_exercise_plus_planned"; multiplier: number; cycleDays: number; netExercise: Array<{ id: string; kcal: number }>; netConfirmed: boolean }
  | { kind: "manual"; kcal: number; source: "user_estimate" | "observational" | "measured_total"; assessedOn?: string }
  | { kind: "not_used" };
export type EnergyMethod = { kind: "preset_percent" } | { kind: "percent"; deltaRatio: number }
  | { kind: "delta_kcal"; deltaKcal: number } | { kind: "fixed_kcal"; kcal: number | null } | { kind: "from_macros" };
export type ProteinMethod = { kind: "body_weight"; coefficient: number | null }
  | { kind: "ffm"; coefficient: number; contextConfirmed: boolean }
  | { kind: "reference_weight"; weightKg: number; coefficient: number; sourceLabel: string }
  | { kind: "fixed_grams"; grams: number };
export type FatMethod = { kind: "body_weight"; coefficient: number | null; minimumEnergyShare: number }
  | { kind: "energy_share"; share: number } | { kind: "fixed_grams"; grams: number };
export interface NutritionPolicyV1 {
  schemaVersion: 1;
  policyVersion: "nutrition-goals-v5.0";
  presetId: GoalPresetId;
  originPreset?: Exclude<GoalPresetId, "custom">;
  presetVersion: 1;
  /** Resolved at selection time: never look up a changed default for a saved policy. */
  presetDeltaRatio: number;
  rmr: RmrMethod;
  tdee: TdeeMethod;
  energy: EnergyMethod;
  protein: ProteinMethod;
  fat: FatMethod;
  carbs: { kind: "residual" } | { kind: "fixed_grams"; grams: number };
  rounding: { autoEnergyStepKcal: number; autoProteinStepG: number; autoFatStepG: number };
  refreshMode: "preview_then_confirm";
}
export interface CalculationBodySnapshot {
  calculationDate: string;
  timeZone: string;
  weightKg?: number | null;
  weightSource?: "manual" | "confirmed" | "seven_day_mean";
  weightDates?: string[];
  heightCm?: number | null;
  ageYears?: number | null;
  ageSource?: "confirmed_years" | "birth_date";
  birthDate?: string;
  calculationSex?: "male" | "female" | null;
  ffmInput?: "body_fat" | "direct";
  bodyFatPct?: number | null;
  bodyFatWeightKg?: number | null;
  bodyFatMeasuredOn?: string;
  bodyFatSource?: string;
  ffmKg?: number | null;
  ffmMeasuredOn?: string;
  ffmSourceLabel?: string;
  scope: { adultAttested: boolean; excluded?: boolean; pregnantOrLactating?: boolean; specialNutritionTherapy?: boolean; eatingDisorder?: boolean; unexplainedWeightLoss?: boolean; enduranceOrCompetitive?: boolean };
  recovery?: "unknown" | "stable" | "concern";
  /** Self-reported selection context; never converted into a hidden PAL adjustment. */
  selectionContext?: { resistanceTraining?: string; experience?: string; weightIntent?: string; workActivity?: string; dailySteps?: string; trainingFrequency?: string };
}
export interface NutritionIssue { code: string; severity: "error" | "review" | "warning"; fieldPaths: string[]; message: string; suggestedActions: string[] }
export interface CalculationTrace { stepId: string; formulaId: string; inputRefs: string[]; rawValue: number; resolvedValue: number; unit: "kcal" | "g" | "kg"; reason: string }
export interface NutritionTargetResolution {
  status: "valid" | "needs_input" | "infeasible" | "requires_review" | "out_of_scope";
  resolvedTarget: MacroTotals | null;
  candidateTarget: MacroTotals | null;
  expenditure: { rmrKcal: number | null; tdeeKcal: number | null; source: string };
  rawValues: { rawEnergyKcal?: number; rawProteinG?: number; rawFatG?: number; ffmKg?: number; averageExerciseKcalPerDay?: number; fatEnergyFloorG?: number; fatFloorApplied?: boolean; energyDeltaKcal?: number; energyDeltaRatio?: number };
  trace: CalculationTrace[];
  assumptions: string[];
  issues: NutritionIssue[];
  algorithmVersion: "nutrition-v5.0";
  policyVersion: string;
  presetVersion: number;
  inputFingerprint: string;
}
export interface NutritionSnapshotV1 {
  schemaVersion: 1;
  source: "user_confirmed";
  policy: NutritionPolicyV1;
  body: CalculationBodySnapshot;
  result: NutritionTargetResolution;
}
