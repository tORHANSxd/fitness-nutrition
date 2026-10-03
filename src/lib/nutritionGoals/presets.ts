import type { GoalPresetId, NutritionPolicyV1 } from "./types";

/** Product defaults and review thresholds, not individual prescriptions or physiological limits. */
const historicalRulesV5 = {
  policyVersion: "nutrition-goals-v5.0", presetVersion: 1, algorithmVersion: "nutrition-v5.0",
  energyStep: 25, proteinStep: 5, fatStep: 5, minimumFatEnergyShare: 0.2,
  lowAutomaticEnergy: 1200, maxDeficitShare: 0.25, maxSurplusShare: 0.15,
  lowBmi: 18.5, highBmi: 35, highAutomaticProtein: 300, minWeightDays: 4, ffmFreshDays: 30,
} as const;
export const nutritionRuleVersions = Object.freeze({ "nutrition-goals-v5.0": Object.freeze(historicalRulesV5) });
export const nutritionRules = nutritionRuleVersions["nutrition-goals-v5.0"];
const historicalPresetsV1 = {
  cut_recomp: { name: "减脂优先·保肌兼顾增肌", description: "体脂偏高、规律抗阻训练；脂肪下降优先，不承诺同步增肌。", energyDeltaRatio: -0.15, proteinPerKg: 1.9, fatPerKg: 0.7, energyRange: [-0.2, -0.1], proteinRange: [1.6, 2.2], reviewDays: 21, weeklyChange: [-0.7, -0.3] },
  cut_lean: { name: "较低体脂·温和减脂", description: "已有训练基础、强调保肌；不适用于竞赛极限减脂。", energyDeltaRatio: -0.1, proteinPerKg: 2.2, fatPerKg: 0.8, energyRange: [-0.15, -0.05], proteinRange: [1.8, 2.4], reviewDays: 21, weeklyChange: [-0.5, -0.2] },
  recomp: { name: "体重稳定·体成分重组", description: "观察围度和力量，体重不降并不代表失败。", energyDeltaRatio: 0, proteinPerKg: 2, fatPerKg: 0.8, energyRange: [-0.05, 0], proteinRange: [1.6, 2.2], reviewDays: 28, weeklyChange: [0, 0] },
  lean_gain: { name: "稳步增肌·控制增脂", description: "偏瘦或正常体重，采用小幅盈余，逐步观察。", energyDeltaRatio: 0.05, proteinPerKg: 1.8, fatPerKg: 0.8, energyRange: [0.03, 0.1], proteinRange: [1.6, 2.2], reviewDays: 28, weeklyChange: [0.1, 0.25] },
  maintain: { name: "维持体重·恢复期", description: "维持现状或暂停主动减脂，不是重置代谢疗法。", energyDeltaRatio: 0, proteinPerKg: 1.6, fatPerKg: 0.8, energyRange: [0, 0], proteinRange: [1.4, 2], reviewDays: 21, weeklyChange: [0, 0] },
} as const;
// Reading presetVersion 1 must not depend on later edits to the active picker defaults.
for (const preset of Object.values(historicalPresetsV1)) {
  Object.freeze(preset.energyRange); Object.freeze(preset.proteinRange); Object.freeze(preset.weeklyChange); Object.freeze(preset);
}
export const goalPresetVersions = Object.freeze({ 1: Object.freeze(historicalPresetsV1) });
export const goalPresets = structuredClone(goalPresetVersions[nutritionRules.presetVersion]);
export const nutritionSources = {
  MSJ_1990: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
  CUNNINGHAM_1980: "https://pubmed.ncbi.nlm.nih.gov/7435418/",
  ISSN_PROTEIN_2017: "https://link.springer.com/article/10.1186/s12970-017-0177-8",
  ISSN_BODY_COMPOSITION_2017: "https://link.springer.com/article/10.1186/s12970-017-0174-y",
  SURPLUS_2023: "https://link.springer.com/article/10.1186/s40798-023-00651-y",
} as const;

export function createNutritionPolicy(presetId: GoalPresetId): NutritionPolicyV1 {
  const preset = presetId === "custom" ? null : goalPresets[presetId];
  return {
    schemaVersion: 1, policyVersion: nutritionRules.policyVersion, presetVersion: 1, presetId,
    presetDeltaRatio: preset?.energyDeltaRatio ?? 0,
    rmr: { kind: "mifflin_st_jeor" },
    tdee: { kind: "pal_total", multiplier: null, includesExercise: true },
    energy: preset ? { kind: "preset_percent" } : { kind: "fixed_kcal", kcal: null },
    protein: { kind: "body_weight", coefficient: preset?.proteinPerKg ?? null },
    fat: { kind: "body_weight", coefficient: preset?.fatPerKg ?? null, minimumEnergyShare: 0.2 },
    carbs: { kind: "residual" }, rounding: { autoEnergyStepKcal: 25, autoProteinStepG: 5, autoFatStepG: 5 },
    refreshMode: "preview_then_confirm",
  };
}
