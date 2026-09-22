import { calculateNutritionTarget, nutritionInputFingerprint } from "./calculator";
import type { CalculationBodySnapshot, NutritionPolicyV1, NutritionSnapshotV1 } from "./types";

export function createNutritionSnapshot(policy: NutritionPolicyV1, body: CalculationBodySnapshot): NutritionSnapshotV1 {
  const result = calculateNutritionTarget(policy, body);
  if (result.status !== "valid" || !result.resolvedTarget) throw new Error(result.issues.map(i => i.message).join(" ") || "目标尚未满足应用条件。");
  return structuredClone({ schemaVersion: 1, source: "user_confirmed", policy, body, result });
}

/** Validate the frozen record using its versioned inputs, return the original snapshot unchanged. */
export function parseNutritionSnapshot(value: unknown): NutritionSnapshotV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("营养快照格式无效。");
  const snapshot = value as NutritionSnapshotV1;
  if (snapshot.schemaVersion !== 1 || snapshot.source !== "user_confirmed" || snapshot.result?.algorithmVersion !== "nutrition-v5.0") throw new Error("不支持的营养快照版本。");
  const computed = calculateNutritionTarget(snapshot.policy, snapshot.body);
  if (computed.status !== "valid" || snapshot.result.status !== "valid" || snapshot.result.inputFingerprint !== nutritionInputFingerprint({ policy: snapshot.policy, body: snapshot.body })
    || snapshot.result.policyVersion !== snapshot.policy.policyVersion || snapshot.result.presetVersion !== snapshot.policy.presetVersion) throw new Error("营养策略、输入或版本校验失败。");
  // Compare all calculation evidence, not merely the headline macros. Unknown fields remain intact.
  for (const key of ["resolvedTarget", "candidateTarget", "expenditure", "rawValues", "trace"] as const) {
    if (nutritionInputFingerprint(snapshot.result[key]) !== nutritionInputFingerprint(computed[key])) throw new Error(`营养快照 ${key} 与版本化输入不一致。`);
  }
  return structuredClone(snapshot);
}
