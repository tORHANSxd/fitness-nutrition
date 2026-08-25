"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { round } from "@/lib/nutrition";
import { displayEnergy, type EnergyUnit } from "@/lib/preferences";
import type { MealPlan, NutritionResult } from "@/lib/types";

interface MacroBarsProps {
  result: NutritionResult;
  meals: MealPlan[];
  energyUnit?: EnergyUnit;
}

const colors = {
  carbs: "rgb(var(--color-accent-2))",
  protein: "#2864DC",
  fat: "#D8493F"
};

const tooltipStyle = {
  backgroundColor: "rgb(var(--color-surface))",
  borderColor: "rgb(var(--color-line))",
  borderRadius: 6,
  boxShadow: "0 8px 24px rgb(var(--color-ink) / 0.12)",
  color: "rgb(var(--color-ink))"
};

const gridStyle = { stroke: "rgb(var(--color-line) / 0.65)", strokeDasharray: "3 3" };
const axisStyle = { fill: "rgb(var(--color-muted))", fontSize: 12 };
const cursorFill = { fill: "rgb(var(--color-accent) / 0.14)" };

function MacroSeries() {
  return (
    <>
      <Bar dataKey="carbs" stackId="macro" fill={colors.carbs} name="碳水 g" />
      <Bar dataKey="protein" stackId="macro" fill={colors.protein} name="蛋白 g" />
      <Bar dataKey="fat" stackId="macro" fill={colors.fat} name="脂肪 g" radius={[3, 3, 3, 3]} />
    </>
  );
}

export function MacroBars({ result, meals, energyUnit = "kcal" }: MacroBarsProps) {
  const [isNarrow, setIsNarrow] = useState(false);
  const energyLabel = energyUnit === "kj" ? "kJ" : "kcal";

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setIsNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const dayData = useMemo(
    () => [
      {
        name: "目标",
        carbs: round(result.dailyTarget.carbs),
        protein: round(result.dailyTarget.protein),
        fat: round(result.dailyTarget.fat)
      },
      {
        name: "当前",
        carbs: round(result.actualTotals.carbs),
        protein: round(result.actualTotals.protein),
        fat: round(result.actualTotals.fat)
      },
      {
        name: "差额",
        carbs: round(result.remaining.carbs),
        protein: round(result.remaining.protein),
        fat: round(result.remaining.fat)
      }
    ],
    [result]
  );

  const mealData = useMemo(
    () =>
      result.mealRecommendations.map((recommendation) => {
        const meal = meals.find((item) => item.id === recommendation.mealId);
        return {
          name: meal?.name ?? recommendation.mealId,
          kcal: recommendation.actual.kcal,
          carbs: round(recommendation.actual.carbs),
          protein: round(recommendation.actual.protein),
          fat: round(recommendation.actual.fat)
        };
      }),
    [meals, result.mealRecommendations]
  );

  const energyData = [
    { label: "目标", value: result.dailyTarget.kcal },
    { label: "当前", value: result.actualTotals.kcal },
    { label: "差额", value: result.remaining.kcal }
  ];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="panel overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h3 className="font-semibold text-ink">当天摄入对比</h3>
          <p className="mt-1 text-xs text-muted">热量单独汇总；图表只比较统一量纲的宏量营养素。</p>
        </div>
        <dl className="grid grid-cols-3 border-b border-line bg-panel/45">
          {energyData.map((item) => (
            <div key={item.label} className="border-r border-line px-3 py-3 last:border-r-0">
              <dt className="metric-label">热量{item.label}</dt>
              <dd className="mt-1 text-base font-semibold tabular-nums text-ink">
                {round(displayEnergy(item.value, energyUnit), 0)} <span className="text-xs font-normal text-muted">{energyLabel}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="h-[280px] px-2 pt-3" role="img" aria-label="当天目标、当前和差额的碳水、蛋白质与脂肪克数柱状图">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayData} layout={isNarrow ? "horizontal" : "vertical"} margin={{ left: 8, right: 18 }}>
              <CartesianGrid {...gridStyle} />
              {isNarrow ? <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} /> : <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} unit="g" />}
              {isNarrow ? <YAxis tick={axisStyle} axisLine={false} tickLine={false} unit="g" /> : <YAxis dataKey="name" type="category" width={54} tick={axisStyle} axisLine={false} tickLine={false} />}
              <Tooltip contentStyle={tooltipStyle} cursor={cursorFill} />
              <Legend wrapperStyle={{ color: "rgb(var(--color-muted))", fontSize: 12 }} />
              <MacroSeries />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <MacroTable rows={dayData} caption="当天宏量营养素数据" />
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h3 className="font-semibold text-ink">每餐当前摄入</h3>
          <p className="mt-1 text-xs text-muted">按餐次比较碳水、蛋白质与脂肪克数。</p>
        </div>
        <div className="h-[280px] px-2 pt-3" role="img" aria-label="各餐碳水、蛋白质与脂肪克数柱状图">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mealData} layout={isNarrow ? "horizontal" : "vertical"} margin={{ left: 8, right: 18 }}>
              <CartesianGrid {...gridStyle} />
              {isNarrow ? <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} /> : <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} unit="g" />}
              {isNarrow ? <YAxis tick={axisStyle} axisLine={false} tickLine={false} unit="g" /> : <YAxis dataKey="name" type="category" width={84} tick={axisStyle} axisLine={false} tickLine={false} />}
              <Tooltip contentStyle={tooltipStyle} cursor={cursorFill} />
              <Legend wrapperStyle={{ color: "rgb(var(--color-muted))", fontSize: 12 }} />
              <MacroSeries />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <MacroTable rows={mealData} caption="各餐宏量营养素数据" energyUnit={energyUnit} />
      </section>
    </div>
  );
}

function MacroTable({
  rows,
  caption,
  energyUnit
}: {
  rows: Array<{ name: string; carbs: number; protein: number; fat: number; kcal?: number }>;
  caption: string;
  energyUnit?: EnergyUnit;
}) {
  const energyLabel = energyUnit === "kj" ? "kJ" : "kcal";
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[420px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-panel/45 text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-semibold" scope="col">项目</th>
            {energyUnit ? <th className="px-3 py-2 text-right font-semibold" scope="col">热量 {energyLabel}</th> : null}
            <th className="px-3 py-2 text-right font-semibold" scope="col">碳水 g</th>
            <th className="px-3 py-2 text-right font-semibold" scope="col">蛋白 g</th>
            <th className="px-4 py-2 text-right font-semibold" scope="col">脂肪 g</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-line">
              <th className="px-4 py-2 text-left font-medium text-ink" scope="row">{row.name}</th>
              {energyUnit ? <td className="px-3 py-2 text-right tabular-nums text-muted">{round(displayEnergy(row.kcal ?? 0, energyUnit), 0)}</td> : null}
              <td className="px-3 py-2 text-right tabular-nums text-muted">{row.carbs}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{row.protein}</td>
              <td className="px-4 py-2 text-right tabular-nums text-muted">{row.fat}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
