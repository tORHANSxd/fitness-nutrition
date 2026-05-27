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
  kcal: "#f97316",
  carbs: "#d97706",
  protein: "#2563eb",
  fat: "#b42318"
};

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
      <Bar dataKey="fat" stackId="macro" fill={colors.fat} name="脂肪 g" />
    </>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-ink">当天摄入对比</h3>
          <span className="text-xs text-muted">热量与宏量营养素</span>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayData} layout={isNarrow ? "horizontal" : "vertical"} margin={{ left: 8, right: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              {isNarrow ? <XAxis dataKey="name" /> : <XAxis type="number" />}
              {isNarrow ? <YAxis /> : <YAxis dataKey="name" type="category" width={54} />}
              <Tooltip />
              <Legend />
              <Bar dataKey="kcal" fill={colors.kcal} name="热量 kcal" />
              {commonBars}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-ink">每餐当前摄入</h3>
          <span className="text-xs text-muted">桌面横向 / 移动竖向</span>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mealData} layout={isNarrow ? "horizontal" : "vertical"} margin={{ left: 8, right: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              {isNarrow ? <XAxis dataKey="name" /> : <XAxis type="number" />}
              {isNarrow ? <YAxis /> : <YAxis dataKey="name" type="category" width={84} />}
              <Tooltip />
              <Legend />
              {commonBars}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
