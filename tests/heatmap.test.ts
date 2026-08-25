import { describe, expect, it } from "vitest";
import { buildNutritionResult } from "@/lib/nutrition";
import {
  aggregateHeatmap,
  buildDailyActual,
  buildHeatmapDays,
  layoutHeatmapTiles,
  rangeForPreset,
  validateHeatmapRange,
  type HeatmapDay
} from "@/lib/heatmap";
import type { DailyCheckin, FoodItem, MealPlan, SavedPlan, UserProfile } from "@/lib/types";

const profile: UserProfile = {
  sex: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityFactor: 1.25,
  exerciseKcal: 0,
  trainingTime: "rest",
  planDate: "2026-08-25"
};

const food: FoodItem = {
  id: "food-apple",
  name: "苹果",
  category: "水果",
  kcalPer100g: 165,
  carbsPer100g: 20,
  proteinPer100g: 10,
  fatPer100g: 5,
  weightBasis: "raw",
  source: "public"
};

const meals: MealPlan[] = [{
  id: "meal-1",
  name: "早餐",
  ratio: 1,
  locked: false,
  entries: [
    { id: "entry-1", foodId: food.id, grams: 100, locked: false },
    { id: "entry-2", foodId: food.id, grams: 50, locked: false }
  ]
}];

function savedPlan(date: string): SavedPlan {
  const datedProfile = { ...profile, planDate: date };
  return {
    id: `plan-${date}`,
    planDate: date,
    profile: datedProfile,
    meals,
    result: buildNutritionResult(datedProfile, meals, [food]),
    createdAt: `${date}T00:00:00.000Z`
  };
}

describe("heatmap ledger", () => {
  it("snapshots and merges repeated foods while separating daily activity from exercise", () => {
    const result = buildNutritionResult(profile, meals, [food]);
    const actual = buildDailyActual(profile, meals, result, new Map([[food.id, food]]));

    expect(actual.foods).toHaveLength(1);
    expect(actual.foods[0]).toMatchObject({ foodId: food.id, grams: 150 });
    expect(actual.foods[0].totals).toMatchObject({ kcal: 247.5, carbs: 30, protein: 15, fat: 7.5 });
    expect(actual.bmrKcal).toBe(result.bmr);
    expect(actual.activityKcal).toBeCloseTo(result.bmr * 0.25, 2);
  });

  it("aggregates same foods and exercises across days with correct ledger signs", () => {
    const days: HeatmapDay[] = ["2026-08-24", "2026-08-25"].map((date) => ({
      date,
      completed: true,
      actual: {
        version: 1,
        foods: [{ foodId: food.id, name: food.name, grams: 100, totals: { kcal: 100, carbs: 20, protein: 10, fat: 5 } }],
        exercises: [{ id: `exercise-${date}`, name: "跑步", kcal: 200 }],
        bmrKcal: 1500,
        activityKcal: 500
      },
      target: { kcal: 2000, carbs: 200, protein: 20, fat: 60 }
    }));

    const calories = aggregateHeatmap(days, "kcal");
    expect(calories.tiles.find((tile) => tile.id === `food:${food.id}`)).toMatchObject({ value: 200 });
    expect(calories.tiles.find((tile) => tile.id === "exercise:跑步")).toMatchObject({ value: -400 });
    expect(calories.tiles.find((tile) => tile.id === "basal")).toMatchObject({ value: -3000 });
    expect(calories.net).toBe(-4200);
    expect(calories.absoluteTotal).toBe(4600);
    expect(calories.tiles.reduce((sum, tile) => sum + tile.share, 0)).toBeCloseTo(1, 10);

    const protein = aggregateHeatmap(days, "protein");
    expect(protein.tiles.find((tile) => tile.id === `food:${food.id}`)).toMatchObject({ value: 20 });
    expect(protein.tiles.find((tile) => tile.id === "target:protein")).toMatchObject({ value: -40 });
    expect(protein.net).toBe(-20);
  });

  it("allocates treemap area in exact proportion to each absolute contribution", () => {
    const dataset = aggregateHeatmap([{
      date: "2026-08-25",
      completed: true,
      actual: {
        version: 1,
        foods: [
          { foodId: "large", name: "大项目", grams: 100, totals: { kcal: 600, carbs: 0, protein: 0, fat: 0 } },
          { foodId: "small", name: "小项目", grams: 100, totals: { kcal: 100, carbs: 0, protein: 0, fat: 0 } }
        ],
        exercises: [{ id: "exercise", name: "运动", kcal: 300 }],
        bmrKcal: 0,
        activityKcal: 0
      },
      target: { kcal: 0, carbs: 0, protein: 0, fat: 0 }
    }], "kcal");
    const width = 1600;
    const height = 1000;
    const canvasArea = width * height;
    const layout = layoutHeatmapTiles(dataset.tiles, width, height);

    expect(layout).toHaveLength(3);
    expect(layout.reduce((sum, item) => sum + item.width * item.height, 0)).toBeCloseTo(canvasArea, 6);
    layout.forEach((item) => {
      expect(item.width * item.height / canvasArea).toBeCloseTo(item.tile.share, 6);
    });
    expect(layoutHeatmapTiles(dataset.tiles, 0, height)).toEqual([]);
  });

  it("keeps today live and excludes incomplete history unless requested", () => {
    const yesterdayPlan = savedPlan("2026-08-24");
    const todayPlan = savedPlan("2026-08-25");
    const hiddenHistory = buildHeatmapDays({
      plans: [yesterdayPlan, todayPlan],
      checkins: [],
      foods: [food],
      today: "2026-08-25",
      includeIncomplete: false
    });
    expect(hiddenHistory.map((day) => day.date)).toEqual(["2026-08-25"]);

    const completedCheckin: DailyCheckin = {
      id: "checkin-1",
      planDate: "2026-08-24",
      actual: buildDailyActual(yesterdayPlan.profile, meals, yesterdayPlan.result, new Map([[food.id, food]])),
      target: yesterdayPlan.result.dailyTarget,
      completed: true,
      createdAt: "",
      updatedAt: ""
    };
    expect(buildHeatmapDays({
      plans: [yesterdayPlan, todayPlan],
      checkins: [completedCheckin],
      foods: [food],
      today: "2026-08-25",
      includeIncomplete: false
    }).map((day) => day.date)).toEqual(["2026-08-24", "2026-08-25"]);
  });

  it("falls back to the saved plan target for completed legacy check-ins", () => {
    const plan = savedPlan("2026-08-24");
    const checkin: DailyCheckin = {
      id: "legacy-checkin",
      planDate: plan.planDate,
      actual: buildDailyActual(plan.profile, meals, plan.result, new Map([[food.id, food]])),
      target: null,
      completed: true,
      createdAt: "",
      updatedAt: ""
    };

    const [day] = buildHeatmapDays({
      plans: [plan],
      checkins: [checkin],
      foods: [food],
      today: "2026-08-25",
      includeIncomplete: false
    });

    expect(day.target).toEqual(plan.result.dailyTarget);
  });

  it("builds timezone-ready presets and caps a query at 366 days", () => {
    expect(rangeForPreset("week", "2026-08-25", 1)).toEqual({ from: "2026-08-24", to: "2026-08-25" });
    expect(rangeForPreset("month", "2026-08-25", 1)).toEqual({ from: "2026-08-01", to: "2026-08-25" });
    expect(rangeForPreset("year", "2026-08-25", 1)).toEqual({ from: "2026-01-01", to: "2026-08-25" });
    expect(validateHeatmapRange({ from: "2024-01-01", to: "2024-12-31" })).toBeNull();
    expect(validateHeatmapRange({ from: "2024-01-01", to: "2025-01-01" })).toBe("单次最多查看 366 天。");
  });
});
