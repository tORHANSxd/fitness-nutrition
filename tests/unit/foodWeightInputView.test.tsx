import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MealSplitView } from "@/components/MealSplitView";
import type { PlannerController } from "@/components/usePlanner";
import { defaultProfile } from "@/lib/demoState";
import { buildNutritionResult } from "@/lib/nutrition";
import { parseMeals } from "@/lib/storageDocuments";
import type { FoodItem, MealFoodEntry, MealPlan } from "@/lib/types";

afterEach(cleanup);
const food: FoodItem = { id: "rice", name: "测试生米", category: "主食", weightBasis: "raw", cookedRawRatio: 2.5, carbsPer100g: 80, proteinPer100g: 8, fatPer100g: 1, kcalPer100g: 361, source: "user" };

function Planner({ ratio = 2.5 }: { ratio?: number | null }) {
  const selectedFood = { ...food, cookedRawRatio: ratio };
  const [meals, setMeals] = useState<MealPlan[]>([{ id: "meal", name: "午餐", ratio: 1, locked: false, entries: [{ id: "entry", foodId: food.id, grams: 100, locked: false, minGrams: 80, maxGrams: 120 }] }]);
  const result = buildNutritionResult(defaultProfile, meals, [selectedFood]);
  const controller: PlannerController = {
    profile: defaultProfile, meals, result, activeMealId: "meal", foodsById: new Map([[food.id, selectedFood]]),
    recommendationsByMeal: new Map(result.mealRecommendations.map((item) => [item.mealId, item])),
    message: "", saving: false, draftState: "ready", setActiveMealId: vi.fn(),
    updateProfile: vi.fn(), updateMeal: vi.fn(), updateMealLayout: vi.fn().mockReturnValue(true),
    addFoodToMeal: vi.fn(), addCustomFoodToMeal: vi.fn(), removeEntry: vi.fn(), applyRecommendations: vi.fn(),
    persistPlan: vi.fn(), normalizeRatios: vi.fn(), saveMealTemplate: vi.fn(), applyMealTemplate: vi.fn(), saveDayTemplate: vi.fn(), applyDayTemplate: vi.fn(),
    updateEntry: (_mealId: string, entryId: string, mapper: (entry: MealFoodEntry) => MealFoodEntry) => setMeals((current) => current.map((meal) => ({ ...meal, entries: meal.entries.map((entry) => entry.id === entryId ? mapper(entry) : entry) }))),
  };
  return <><MealSplitView controller={controller} foods={[selectedFood]} templates={{ mealTemplates: [], dayTemplates: [] }} /><output data-testid="stored-entry">{JSON.stringify(meals[0].entries[0])}</output><button onClick={() => setMeals(parseMeals(JSON.parse(JSON.stringify(meals))))}>重载计划</button></>;
}
const savedEntry = () => JSON.parse(screen.getByTestId("stored-entry").textContent!);

it("同时展示生熟重，切换保留份量；按熟重输入会换算营养及范围，保存重载仍一致", () => {
  render(<Planner />);
  expect(screen.getByLabelText("测试生米生熟重量")).toHaveTextContent("生重 100 g · 熟重约 250 g");
  fireEvent.change(screen.getByLabelText("测试生米计算标准"), { target: { value: "cooked" } });
  expect(screen.getByLabelText("测试生米克重")).toHaveValue("250");
  expect(savedEntry()).toMatchObject({ grams: 100, minGrams: 80, maxGrams: 120, locked: false, inputWeightBasis: "cooked" });
  expect(screen.getByLabelText("测试生米最小克重")).toHaveValue("200");
  expect(screen.getByLabelText("测试生米最大克重")).toHaveValue("300");
  fireEvent.change(screen.getByLabelText("测试生米克重"), { target: { value: "100" } });
  expect(savedEntry()).toMatchObject({ grams: 40, locked: false });
  expect(screen.getByText(/碳 32 · 蛋 3.2 · 脂/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("测试生米最小克重"), { target: { value: "150" } });
  expect(savedEntry().minGrams).toBe(60);
  fireEvent.click(screen.getByText("重载计划"));
  expect(screen.getByLabelText("测试生米计算标准")).toHaveValue("cooked");
  expect(screen.getByLabelText("测试生米克重")).toHaveValue("100");
  fireEvent.change(screen.getByLabelText("测试生米计算标准"), { target: { value: "raw" } });
  expect(screen.getByLabelText("测试生米克重")).toHaveValue("40");
  expect(savedEntry().grams).toBe(40);
});

it("缺出成率时禁用反向输入，填入实测比率后才支持切换", () => {
  render(<Planner ratio={null} />);
  expect(screen.getByRole("option", { name: "熟重" })).toBeDisabled();
  expect(screen.getByLabelText("测试生米生熟重量")).toHaveTextContent("熟重待实测");
  fireEvent.change(screen.getByLabelText("测试生米熟生比"), { target: { value: "3" } });
  expect(screen.getByRole("option", { name: "熟重" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("测试生米计算标准"), { target: { value: "cooked" } });
  expect(screen.getByLabelText("测试生米克重")).toHaveValue("300");
  expect(savedEntry()).toMatchObject({ grams: 100, inputCookedRawRatio: 3 });
});
