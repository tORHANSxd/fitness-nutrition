import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FoodPickerDialog } from "@/components/FoodPickerDialog";
import { MealSplitView } from "@/components/MealSplitView";
import { PlannerProfileView } from "@/components/PlannerProfileView";
import type { PlannerController } from "@/components/usePlanner";
import { createStarterMeals, defaultProfile } from "@/lib/demoState";
import { builtinFoods } from "@/lib/foods";
import { buildNutritionResult } from "@/lib/nutrition";
import type { FoodItem, UserProfile } from "@/lib/types";

// MacroBars 依赖 recharts + window.matchMedia，在 jsdom 里与本用例无关，打桩掉避免噪音。
vi.mock("@/components/MacroBars", () => ({ MacroBars: () => null }));

afterEach(cleanup);

function makeController(profileOverrides: Partial<UserProfile> = {}, controllerOverrides: Partial<PlannerController> = {}): PlannerController {
  const profile: UserProfile = { ...defaultProfile, planDate: "2026-05-22", ...profileOverrides };
  const meals = createStarterMeals(profile);
  const result = buildNutritionResult(profile, meals, builtinFoods);
  const foodsById = new Map(builtinFoods.map((food) => [food.id, food]));
  const recommendationsByMeal = new Map(result.mealRecommendations.map((recommendation) => [recommendation.mealId, recommendation]));
  return {
    profile,
    meals,
    activeMealId: meals[0]?.id ?? "",
    message: "",
    saving: false,
    result,
    foodsById,
    recommendationsByMeal,
    setActiveMealId: vi.fn(),
    updateProfile: vi.fn(),
    updateMeal: vi.fn(),
    addFoodToMeal: vi.fn(),
    updateEntry: vi.fn(),
    removeEntry: vi.fn(),
    applyRecommendations: vi.fn(),
    persistPlan: vi.fn(),
    normalizeRatios: vi.fn(),
    saveMealTemplate: vi.fn(),
    applyMealTemplate: vi.fn(),
    saveDayTemplate: vi.fn(),
    applyDayTemplate: vi.fn(),
    ...controllerOverrides
  };
}

const pick = (id: string) => builtinFoods.find((food) => food.id === id)!;
const isBefore = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("FoodPickerDialog（先选分类，再选食物）", () => {
  const foods: FoodItem[] = [
    pick("public-oats-raw"), // 燕麦片 主食
    pick("public-apple-raw"), // 苹果 水果
    pick("public-rice-cooked"), // 白米饭 主食
    pick("public-chicken-breast-cooked") // 鸡胸肉 肉类
  ];

  it("renders nothing when closed", () => {
    const { container } = render(<FoodPickerDialog open={false} foods={foods} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists foods sorted by category then pinyin and reports the picked food", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<FoodPickerDialog open foods={foods} onSelect={onSelect} onClose={onClose} />);

    // 分类标签：全部 + 主食/水果/肉类（按 foodCategories 顺序）。
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "主食" })).toBeInTheDocument();

    // 列表顺序：主食(白米饭<燕麦片) → 水果(苹果) → 肉类(鸡胸肉)。
    const rice = screen.getByText("白米饭");
    const oats = screen.getByText("燕麦片");
    const apple = screen.getByText("苹果");
    const chicken = screen.getByText("鸡胸肉");
    expect(isBefore(rice, oats)).toBe(true);
    expect(isBefore(oats, apple)).toBe(true);
    expect(isBefore(apple, chicken)).toBe(true);

    fireEvent.click(rice);
    expect(onSelect).toHaveBeenCalledWith("public-rice-cooked");
    expect(onClose).toHaveBeenCalled();
  });

  it("filters the list to a single category when its chip is clicked", () => {
    render(<FoodPickerDialog open foods={foods} onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "水果" }));

    expect(screen.getByText("苹果")).toBeInTheDocument();
    expect(screen.queryByText("白米饭")).not.toBeInTheDocument();
    expect(screen.queryByText("鸡胸肉")).not.toBeInTheDocument();
  });
});

describe("PlannerProfileView 碳循环日 / 训练时间", () => {
  function carbSelect() {
    return screen.getByText("碳循环日").closest("label")!.querySelector("select") as HTMLSelectElement;
  }
  function timeSelect() {
    return screen.getByText("训练时间").closest("label")!.querySelector("select") as HTMLSelectElement;
  }

  it("offers only 高碳日/低碳日 and stays enabled on a training day", () => {
    render(<PlannerProfileView controller={makeController({ trainingTime: "afternoon", carbDayType: "high" })} />);
    const select = carbSelect();
    expect(select).not.toBeDisabled();
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["高碳日", "低碳日"]);
    expect(select).toHaveValue("high");
  });

  it("locks the carb day to low and shows a hint on a rest day", () => {
    render(<PlannerProfileView controller={makeController({ trainingTime: "rest", carbDayType: "high" })} />);
    const select = carbSelect();
    expect(select).toBeDisabled();
    expect(select).toHaveValue("low"); // resolveCarbDayType 休息日强制低碳
    expect(screen.getByText("休息日固定低碳。")).toBeInTheDocument();
  });

  it("adds a rest-day option to training time", () => {
    render(<PlannerProfileView controller={makeController()} />);
    expect(within(timeSelect()).getAllByRole("option").map((option) => option.textContent)).toContain("休息日");
  });
});

describe("MealSplitView（分餐单独页含应用推荐/保存计划 + 弹出选食）", () => {
  const templates = { mealTemplates: [], dayTemplates: [] };

  it("surfaces the apply/save/normalize actions moved onto this page", () => {
    const controller = makeController();
    render(<MealSplitView controller={controller} foods={builtinFoods} templates={templates} />);

    expect(screen.getByRole("button", { name: /归一比例/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存计划/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /应用推荐/ }));
    expect(controller.applyRecommendations).toHaveBeenCalledTimes(1);
  });

  it("opens the food picker from 添加食物 and reports the chosen food id", () => {
    const controller = makeController();
    render(<MealSplitView controller={controller} foods={builtinFoods} templates={templates} />);

    fireEvent.click(screen.getByRole("button", { name: /添加食物/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // 面板内选「白米饭」（早餐默认没有它，不与行内选食按钮歧义）。
    fireEvent.click(within(dialog).getByText("白米饭"));
    expect(controller.addFoodToMeal).toHaveBeenCalledWith(controller.activeMealId, "public-rice-cooked");
  });
});
