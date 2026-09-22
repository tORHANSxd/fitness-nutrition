"use client";

import { displayEnergy, type EnergyUnit } from "@/lib/preferences";
import { nutritionSources } from "@/lib/nutritionGoals/presets";
import type {
  NutritionPolicyV1,
  NutritionTargetResolution,
} from "@/lib/nutritionGoals/types";

export function NutritionCalculationDetails({
  result,
  policy,
  energyUnit,
  frozen = false,
}: {
  result: NutritionTargetResolution;
  policy: NutritionPolicyV1;
  energyUnit: EnergyUnit;
  frozen?: boolean;
}) {
  const energy = (v: number | null) =>
    v == null
      ? "未使用 / 待填写"
      : `${Number(displayEnergy(v, energyUnit).toFixed(2))} ${energyUnit === "kj" ? "kJ" : "kcal"}`;
  const target = result.resolvedTarget ?? result.candidateTarget;
  return (
    <div className="min-w-0 space-y-3" aria-label="营养计算结果">
      {result.expenditure.tdeeKcal != null && (
        <p className="text-sm text-muted">
          每日消耗估计：{energy(result.expenditure.tdeeKcal)}
        </p>
      )}
      <p role="status" className="text-sm">
        {frozen
          ? "已保存的目标"
          : {
              valid: "预览结果，确认后生效",
              needs_input: "数据待填写",
              infeasible: "当前配置不可计算",
              requires_review: "请先核对以下信息",
              out_of_scope: "当前情况需要专业营养建议",
            }[result.status]}
      </p>
      {target && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">
              能量 ·{" "}
              {policy.energy.kind === "fixed_kcal"
                ? "手动设置"
                : policy.energy.kind === "from_macros"
                  ? "按营养素计算"
                  : "自动"}
            </dt>
            <dd
              data-testid="candidate-energy"
              className="break-words font-semibold"
            >
              {energy(target.kcal)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">
              蛋白 ·{" "}
              {policy.protein.kind === "fixed_grams" ? "手动设置" : "自动"}
            </dt>
            <dd data-testid="candidate-protein">
              {Number(target.protein.toFixed(3))} g
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">
              脂肪 · {policy.fat.kind === "fixed_grams" ? "手动设置" : "自动"}
            </dt>
            <dd data-testid="candidate-fat">
              {Number(target.fat.toFixed(3))} g
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">
              碳水 ·{" "}
              {policy.carbs.kind === "residual" ? "剩余能量" : "手动设置"}
            </dt>
            <dd data-testid="candidate-carbs">
              {Number(target.carbs.toFixed(1))} g
            </dd>
          </div>
        </dl>
      )}
      {result.rawValues.energyDeltaKcal != null && (
        <p className="text-sm">
          取整后的实际能量偏移：
          {result.rawValues.energyDeltaKcal >= 0 ? "+" : "−"}
          {energy(Math.abs(result.rawValues.energyDeltaKcal))}（
          {Number((result.rawValues.energyDeltaRatio! * 100).toFixed(2))}%）。
        </p>
      )}
      {target && target.kcal > 0 && (
        <p className="text-xs text-muted">
          供能比例：蛋白质{" "}
          {(((target.protein * 4) / target.kcal) * 100).toFixed(1)}% / 脂肪{" "}
          {(((target.fat * 9) / target.kcal) * 100).toFixed(1)}% / 碳水{" "}
          {(((target.carbs * 4) / target.kcal) * 100).toFixed(1)}%。
        </p>
      )}
      {!!result.issues.length && (
        <ul className="space-y-1 text-sm">
          {result.issues.map((issue, i) => (
            <li
              key={`${issue.code}-${i}`}
              className={
                issue.severity === "warning" ? "text-muted" : "text-warning"
              }
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      <details className="rounded border border-line p-3">
        <summary className="cursor-pointer">计算明细与参考来源</summary>
        <ol className="mt-3 space-y-3 text-sm">
          {result.trace.map((step) => (
            <li key={step.stepId} className="break-words">
              <p>{step.reason}</p>
              <p>
                原始值 {step.rawValue} {step.unit} → 确定值 {step.resolvedValue}{" "}
                {step.unit}
                {step.unit === "kcal" && energyUnit === "kj"
                  ? `（显示 ${energy(step.resolvedValue)}）`
                  : ""}
              </p>
            </li>
          ))}
        </ol>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {result.assumptions.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        <p className="mt-2 flex flex-wrap gap-3 text-xs">
          {Object.entries(nutritionSources).map(([id, url]) => (
            <a
              key={id}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {id}
            </a>
          ))}
        </p>
      </details>
    </div>
  );
}
