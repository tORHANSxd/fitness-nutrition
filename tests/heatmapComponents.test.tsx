import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DailyCheckinPanel } from "@/components/DailyCheckinPanel";
import { HeatmapView } from "@/components/workspaces/HeatmapView";
import type { PlannerController } from "@/components/usePlanner";
import { buildNutritionResult } from "@/lib/nutrition";
import type { DailyCheckin, FoodItem, MealPlan, UserProfile } from "@/lib/types";

const storageMocks = vi.hoisted(() => ({
  completeDailyRecord: vi.fn(),
  loadDailyCheckin: vi.fn(),
  loadDailyCheckins: vi.fn(),
  loadPlannerDraft: vi.fn(),
  loadHeatmapPlanInputs: vi.fn(),
  saveDailyCheckin: vi.fn(),
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
const dinnerFood: FoodItem = {
  ...food,
  id: "food-dinner",
  name: "晚餐三文鱼",
  kcalPer100g: 208,
  carbsPer100g: 0,
  proteinPer100g: 20,
  fatPer100g: 13
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
    draftState: "ready",
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
    version: 2,
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
      energyUnit: "kcal",
      heatmapPalette: "red-positive"
    },
    updatePreferences: vi.fn().mockResolvedValue(true),
    user
  };
  storageMocks.loadDailyCheckin.mockResolvedValue(null);
  storageMocks.loadDailyCheckins.mockResolvedValue([completedCheckin]);
  storageMocks.loadPlannerDraft.mockResolvedValue(null);
  storageMocks.loadHeatmapPlanInputs.mockResolvedValue([]);
  storageMocks.saveDailyCheckin.mockImplementation(async (input) => ({
    id: "checkin-saved",
    ...input,
    createdAt: "",
    updatedAt: ""
  }));
  storageMocks.completeDailyRecord.mockImplementation(async (_profile, _meals, _result, actual, target) => ({
    id: "checkin-complete",
    planDate: "2026-08-25",
    actual,
    target,
    completed: true,
    createdAt: "",
    updatedAt: ""
  }));
});

afterEach(cleanup);

describe("DailyCheckinPanel", () => {
  it("saves manual exercise energy and completes the plan and check-in atomically", async () => {
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
    await waitFor(() => expect(storageMocks.completeDailyRecord).toHaveBeenCalledOnce());
    expect(storageMocks.completeDailyRecord.mock.calls[0][3].exercises[0]).toMatchObject({ name: "跑步", kcal: 320 });
  });
});

describe("HeatmapView", () => {
  it("loads every meal in today's latest planner draft", async () => {
    appMock.value = { ...appMock.value, foods: [food, dinnerFood] };
    storageMocks.loadPlannerDraft.mockResolvedValue({
      profile,
      meals: [
        ...meals,
        {
          id: "dinner",
          name: "晚餐",
          ratio: 0.3,
          locked: false,
          entries: [{ id: "dinner-entry", foodId: dinnerFood.id, grams: 180, locked: false }]
        }
      ],
      updatedAt: "2026-08-25T12:00:00.000Z",
      revision: 2,
      schemaVersion: 2
    });

    render(<HeatmapView />);

    expect(await screen.findByRole("button", { name: /热力图项目：晚餐三文鱼/ })).toBeInTheDocument();
    expect(storageMocks.loadPlannerDraft).toHaveBeenCalledWith(user);
  });

  it("switches metrics, opens details, persists palette and loads month-to-date", async () => {
    render(<HeatmapView />);

    const appleTile = await screen.findByRole("button", { name: /热力图项目：苹果/ });
    expect(appleTile).toHaveAccessibleName(/绝对贡献占比/);
    expect(appleTile).toHaveAttribute("data-share");
    expect(Number(appleTile.getAttribute("data-intensity"))).toBeLessThan(100);
    expect(appleTile.style.getPropertyValue("--tile-width")).toMatch(/%$/);
    const appleFillAlpha = Number(appleTile.style.getPropertyValue("--jelly-fill-alpha"));
    const basalTile = await screen.findByRole("button", { name: /热力图项目：基础代谢/ });
    const basalFillAlpha = Number(basalTile.style.getPropertyValue("--jelly-fill-alpha"));
    expect(basalTile).toHaveAttribute("data-intensity", "100.0");
    expect(basalFillAlpha - appleFillAlpha).toBeGreaterThan(0.5);
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
    await waitFor(() => expect((appMock.value.updatePreferences as ReturnType<typeof vi.fn>)).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "本月至今" }));
    await waitFor(() => expect(storageMocks.loadDailyCheckins).toHaveBeenLastCalledWith(user, "2026-08-01", "2026-08-25"));
  });
});
