"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { MacroTotals, MealPlan, NutritionResult } from "@/lib/types";
import { round } from "@/lib/nutrition";

interface MacroBarsProps {
  result: NutritionResult;
  meals: MealPlan[];
}

const colors = {
  kcal: "#155D4A",
  carbs: "#C88410",
  protein: "#2864DC",
  fat: "#D8493F"
};

const tooltipStyle = {
  backgroundColor: "#FBFCF7",
  borderColor: "#11130F",
  borderRadius: 6,
  boxShadow: "5px 5px 0 rgba(17,19,15,0.12)",
  color: "#11130F"
};

const gridStyle = { stroke: "rgba(17,19,15,0.1)", strokeDasharray: "3 3" };
const axisStyle = { fill: "rgba(93,98,88,0.95)", fontSize: 12 };
const cursorFill = { fill: "rgba(199,243,107,0.16)" };

export function MacroBars({ result, meals }: MacroBarsProps) {
  const [isNarrow, setIsNarrow] = useState(false);

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
        kcal: round(result.dailyTarget.kcal, 0),
        carbs: round(result.dailyTarget.carbs),
        protein: round(result.dailyTarget.protein),
        fat: round(result.dailyTarget.fat)
      },
      {
        name: "当前",
        kcal: round(result.actualTotals.kcal, 0),
        carbs: round(result.actualTotals.carbs),
        protein: round(result.actualTotals.protein),
        fat: round(result.actualTotals.fat)
      },
      {
        name: "差额",
        kcal: round(result.remaining.kcal, 0),
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
          kcal: round(recommendation.actual.kcal, 0),
          carbs: round(recommendation.actual.carbs),
          protein: round(recommendation.actual.protein),
          fat: round(recommendation.actual.fat)
        };
      }),
    [meals, result.mealRecommendations]
  );

  const commonBars = (
    <>
      <Bar dataKey="carbs" stackId="macro" fill={colors.carbs} name="碳水 g" />
      <Bar dataKey="protein" stackId="macro" fill={colors.protein} name="蛋白 g" />
      <Bar dataKey="fat" stackId="macro" fill={colors.fat} name="脂肪 g" radius={[3, 3, 3, 3]} />
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold tracking-tight text-ink">当天摄入对比</h3>
          <span className="rounded-full border border-line bg-ground/40 px-2.5 py-0.5 text-xs font-medium text-muted">目标 / 当前 / 差额</span>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayData} layout={isNarrow ? "horizontal" : "vertical"} margin={{ left: 8, right: 18 }}>
              <CartesianGrid {...gridStyle} />
              {isNarrow ? <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} /> : <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />}
              {isNarrow ? <YAxis tick={axisStyle} axisLine={false} tickLine={false} /> : <YAxis dataKey="name" type="category" width={54} tick={axisStyle} axisLine={false} tickLine={false} />}
              <Tooltip contentStyle={tooltipStyle} cursor={cursorFill} />
              <Legend wrapperStyle={{ color: "rgba(93,98,88,0.95)", fontSize: 12 }} />
              <Bar dataKey="kcal" fill={colors.kcal} name="热量 kcal" radius={[3, 3, 3, 3]} />
              {commonBars}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold tracking-tight text-ink">每餐当前摄入</h3>
          <span className="rounded-full border border-line bg-ground/40 px-2.5 py-0.5 text-xs font-medium text-muted">按餐次拆分</span>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mealData} layout={isNarrow ? "horizontal" : "vertical"} margin={{ left: 8, right: 18 }}>
              <CartesianGrid {...gridStyle} />
              {isNarrow ? <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} /> : <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />}
              {isNarrow ? <YAxis tick={axisStyle} axisLine={false} tickLine={false} /> : <YAxis dataKey="name" type="category" width={84} tick={axisStyle} axisLine={false} tickLine={false} />}
              <Tooltip contentStyle={tooltipStyle} cursor={cursorFill} />
              <Legend wrapperStyle={{ color: "rgba(93,98,88,0.95)", fontSize: 12 }} />
              {commonBars}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
