import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DailyCheckinPanel } from "@/components/DailyCheckinPanel";
import { HeatmapView } from "@/components/workspaces/HeatmapView";
import type { PlannerController } from "@/components/usePlanner";
import { buildNutritionResult } from "@/lib/nutrition";
import type { DailyCheckin, FoodItem, MealPlan, UserProfile } from "@/lib/types";

const storageMocks = vi.hoisted(() => ({
  loadDailyCheckin: vi.fn(),
  loadDailyCheckins: vi.fn(),
  loadHeatmapPalette: vi.fn(),
  loadPlansInRange: vi.fn(),
  saveDailyCheckin: vi.fn(),
  saveHeatmapPalette: vi.fn()
}));

const appMock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/lib/storage", () => storageMocks);
vi.mock("@/components/app/AppProvider", () => ({ useApp: () => appMock.value }));
vi.mock("@/hooks/useZonedToday", () => ({ useZonedToday: () => "2026-08-25" }));

const user = { id: "00000000-0000-4000-8000-000000000001", email: "test@example.com" } as User;
const food: FoodItem = {
  id: "food-apple",
  name: "苹果",
  category: "水果",
  kcalPer100g: 52,
  carbsPer100g: 12,
  proteinPer100g: 0.5,
  fatPer100g: 0.2,
  weightBasis: "raw",
  source: "public"
};
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
const meals: MealPlan[] = [{
  id: "meal-1",
  name: "早餐",
  ratio: 1,
  locked: false,
  entries: [{ id: "entry-1", foodId: food.id, grams: 100, locked: false }]
}];

function controller(): PlannerController {
  const result = buildNutritionResult(profile, meals, [food]);
  return {
    profile,
    meals,
    activeMealId: "meal-1",
    message: "",
    saving: false,
    draftState: "idle",
    result,
    foodsById: new Map([[food.id, food]]),
    recommendationsByMeal: new Map(result.mealRecommendations.map((item) => [item.mealId, item])),
    setActiveMealId: vi.fn(),
    updateProfile: vi.fn(),
    updateMeal: vi.fn(),
    addFoodToMeal: vi.fn(),
    addCustomFoodToMeal: vi.fn(),
    updateEntry: vi.fn(),
    removeEntry: vi.fn(),
    applyRecommendations: vi.fn(),
    persistPlan: vi.fn().mockResolvedValue(true),
    normalizeRatios: vi.fn(),
    saveMealTemplate: vi.fn(),
    applyMealTemplate: vi.fn(),
    saveDayTemplate: vi.fn(),
    applyDayTemplate: vi.fn()
  };
}

const completedCheckin: DailyCheckin = {
  id: "checkin-1",
  planDate: "2026-08-25",
  actual: {
    version: 1,
    foods: [{ foodId: food.id, name: food.name, grams: 100, totals: { kcal: 52, carbs: 12, protein: 5, fat: 0.2 } }],
    exercises: [{ id: "exercise-1", name: "跑步", kcal: 200 }],
    bmrKcal: 1500,
    activityKcal: 300
  },
  target: { kcal: 2000, carbs: 200, protein: 10, fat: 60 },
  completed: true,
  createdAt: "",
  updatedAt: ""
};

beforeEach(() => {
  vi.clearAllMocks();
  appMock.value = {
    foods: [food],
    preferences: {
      locale: "zh-CN",
      timeZone: "Asia/Shanghai",
      weekStartsOn: 1,
      energyUnit: "kcal"
    },
    user
  };
  storageMocks.loadDailyCheckin.mockResolvedValue(null);
  storageMocks.loadDailyCheckins.mockResolvedValue([completedCheckin]);
  storageMocks.loadHeatmapPalette.mockResolvedValue("red-positive");
  storageMocks.loadPlansInRange.mockResolvedValue([]);
  storageMocks.saveDailyCheckin.mockImplementation(async (input) => ({
    id: "checkin-saved",
    ...input,
    createdAt: "",
    updatedAt: ""
  }));
  storageMocks.saveHeatmapPalette.mockImplementation(async (palette) => palette);
});

afterEach(cleanup);

describe("DailyCheckinPanel", () => {
  it("saves manual exercise energy and only completes after the plan saves", async () => {
    const planner = controller();
    render(<DailyCheckinPanel controller={planner} date="2026-08-25" today="2026-08-25" user={user} energyUnit="kcal" />);

    expect(await screen.findByText("尚无运动消耗")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("运动名称"), { target: { value: "跑步" } });
    fireEvent.change(screen.getByLabelText("消耗 kcal"), { target: { value: "320" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(storageMocks.saveDailyCheckin).toHaveBeenCalled());
    const exerciseWrite = storageMocks.saveDailyCheckin.mock.calls[0][0];
    expect(exerciseWrite.actual.exercises[0]).toMatchObject({ name: "跑步", kcal: 320 });
    expect(exerciseWrite.completed).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "完成记录" }));
    await waitFor(() => expect(planner.persistPlan).toHaveBeenCalledOnce());
    await waitFor(() => expect(storageMocks.saveDailyCheckin.mock.calls.at(-1)?.[0].completed).toBe(true));
  });
});

describe("HeatmapView", () => {
  it("switches metrics, opens details, persists palette and loads month-to-date", async () => {
    render(<HeatmapView />);

    const appleTile = await screen.findByRole("button", { name: /热力图项目：苹果/ });
    expect(appleTile).toHaveAccessibleName(/绝对贡献占比/);
    expect(appleTile).toHaveAttribute("data-share");
    expect(Number(appleTile.getAttribute("data-intensity"))).toBeLessThan(100);
    expect(appleTile.style.getPropertyValue("--tile-width")).toMatch(/%$/);
    expect(appleTile.style.getPropertyValue("--jelly-fill-alpha")).not.toBe("");
    expect(await screen.findByRole("button", { name: /热力图项目：基础代谢/ })).toHaveAttribute("data-intensity", "100.0");
    const exerciseIndexItem = screen.getByRole("button", { name: /项目索引：跑步/ });
    expect(exerciseIndexItem).toHaveAccessibleName(/绝对贡献占比/);
    fireEvent.click(exerciseIndexItem);
    expect(screen.getByRole("heading", { name: "跑步" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /蛋白质/ }));
    expect(await screen.findByRole("button", { name: /热力图项目：目标需求/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /热力图项目：苹果/ }));
    expect(screen.getByRole("heading", { name: "苹果" })).toBeInTheDocument();
    expect(appleTile).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(storageMocks.saveHeatmapPalette).toHaveBeenCalledWith("green-positive", user));

    fireEvent.click(screen.getByRole("button", { name: "本月至今" }));
    await waitFor(() => expect(storageMocks.loadDailyCheckins).toHaveBeenLastCalledWith(user, "2026-08-01", "2026-08-25"));
  });
});
