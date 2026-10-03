import Link from "next/link";
import { displayEnergy, type EnergyUnit } from "@/lib/preferences";
import type { MacroTotals } from "@/lib/types";

export function NutritionSummary({
  total,
  target,
  energyUnit = "kcal",
  label = "计划摄入",
}: {
  total: MacroTotals;
  target: MacroTotals;
  energyUnit?: EnergyUnit;
  label?: string;
}) {
  const fields = [
    { key: "kcal", label: "热量", color: "var(--color-accent-2)" },
    { key: "carbs", label: "碳水", color: "var(--color-carbs)" },
    { key: "protein", label: "蛋白质", color: "var(--color-protein)" },
    { key: "fat", label: "脂肪", color: "var(--color-fat)" },
  ] as const;
  const format = (n: number) =>
    n > 0 && n < 0.1
      ? "<0.1"
      : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(n);
  return (
    <section className="panel nutrition-summary" aria-label={label}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{label}</h2>
        <Link
          className="text-xs font-medium text-accent2 hover:underline"
          href="/goals"
        >
          {target.kcal > 0 ? "调整目标" : "设置目标"}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {fields.map(({ key, label: fieldLabel, color }) => {
          const value = Number.isFinite(total[key])
            ? Math.max(0, total[key])
            : 0;
          const goal = Number.isFinite(target[key])
            ? Math.max(0, target[key])
            : 0;
          const shown =
            key === "kcal" ? displayEnergy(value, energyUnit) : value;
          const shownGoal =
            key === "kcal" ? displayEnergy(goal, energyUnit) : goal;
          const unit =
            key === "kcal" ? (energyUnit === "kj" ? "kJ" : "kcal") : "g";
          const excess = value > goal && goal > 0;
          return (
            <div key={key} className="min-w-0">
              <p className="mb-2 text-xs text-muted">{fieldLabel}</p>
              <p className="break-words text-2xl font-semibold tabular-nums tracking-tight">
                {format(shown)}{" "}
                <span className="text-xs font-normal text-muted">{unit}</span>
              </p>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel"
                role="meter"
                aria-label={`${fieldLabel}目标完成比例`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  goal > 0 ? Math.min(100, (value / goal) * 100) : 0
                }
                aria-valuetext={
                  goal > 0
                    ? `${format((value / goal) * 100)}%，${excess ? "已超出目标" : "计划值"}`
                    : "未设置目标"
                }
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                  style={{
                    width: `${goal > 0 ? Math.min(100, (value / goal) * 100) : 0}%`,
                    background: `rgb(${color})`,
                  }}
                />
              </div>
              <p
                className={`mt-2 text-xs tabular-nums ${excess ? "text-warning" : "text-muted"}`}
              >
                {goal > 0
                  ? excess
                    ? `超出 ${format(shown - shownGoal)} ${unit}`
                    : `目标 ${format(shownGoal)} ${unit}`
                  : "未设目标"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
