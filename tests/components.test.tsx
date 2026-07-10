import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AuthPanel } from "@/components/AuthPanel";
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
    addCustomFoodToMeal: vi.fn(),
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

describe("AuthPanel（Claude 式单列登录卡）", () => {
  it("renders the login form with email/password, primary action and a register link", () => {
    render(<AuthPanel user={null} onSignedIn={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("name@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("至少 6 位")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();

    // 模式切换是文字链接式按钮，而不是第二个大按钮。
    fireEvent.click(screen.getByRole("button", { name: "注册" }));
    expect(screen.getByRole("heading", { name: "注册" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument(); // 切回链接
  });
});

describe("PlannerProfileView v2 固定目标 / 训练时间", () => {
  function fieldInput(labelText: string) {
    return screen.getByText(labelText).closest("label")!.querySelector("input") as HTMLInputElement;
  }
  function timeSelect() {
    return screen.getByText("训练时间").closest("label")!.querySelector("select") as HTMLSelectElement;
  }

  it("shows formula-derived targets as placeholders (demo profile → 2295/175/61) and no carb-day picker", () => {
    render(<PlannerProfileView controller={makeController({ trainingTime: "afternoon" })} />);
    expect(screen.queryByText("碳循环日")).not.toBeInTheDocument();
    // 覆盖字段默认留空 = 用公式；placeholder 展示公式值（demo 档案 93.2kg/26%）。
    expect(fieldInput("每日目标 kcal")).toHaveValue(null);
    expect(fieldInput("每日目标 kcal").placeholder).toBe("自动 2295");
    expect(fieldInput("蛋白目标 g").placeholder).toBe("自动 175");
    expect(fieldInput("脂肪目标 g").placeholder).toBe("自动 61");
    // 体脂率与赤字字段就位。
    expect(fieldInput("体脂率 %")).toHaveValue(26);
    expect(fieldInput("减脂赤字 kcal/天")).toHaveValue(600);
  });

  it("shows the guidance banner and generic placeholders on an empty new-account profile", () => {
    render(<PlannerProfileView controller={makeController({ age: 0, heightCm: 0, weightKg: 0, bodyFatPct: null })} />);
    expect(screen.getByText(/先填写年龄、身高、体重/)).toBeInTheDocument();
    expect(fieldInput("每日目标 kcal").placeholder).toBe("自动");
    expect(fieldInput("体重 kg")).toHaveValue(null);
  });

  it("treats a rest day like any other day (no carb-day badge or forced low carb)", () => {
    render(<PlannerProfileView controller={makeController({ trainingTime: "rest" })} />);
    expect(screen.queryByText("休息日固定低碳。")).not.toBeInTheDocument();
    // 碳循环概念已整体移除：不再有任何碳日徽章/文案。
    expect(screen.queryByText(/碳日|高碳|低碳|标准日/)).not.toBeInTheDocument();
  });

  it("adds a rest-day option to training time", () => {
    render(<PlannerProfileView controller={makeController()} />);
    expect(within(timeSelect()).getAllByRole("option").map((option) => option.textContent)).toContain("休息日");
  });

  it("renders the weekly-plan panel with live formula targets, not hardcoded numbers", () => {
    render(<PlannerProfileView controller={makeController()} />);
    // demo 档案 93.2kg/26% → 2295 kcal / P175 / F61 / C261.5，全部实时测算。
    expect(screen.getByText(/每日目标 2295 kcal · 蛋白 175g · 脂肪 61g · 碳水 261\.5g/)).toBeInTheDocument();
    expect(screen.queryByText(/固定 2300/)).not.toBeInTheDocument();
  });

  it("weekly-plan panel prompts for the profile instead of showing zero targets", () => {
    render(<PlannerProfileView controller={makeController({ age: 0, heightCm: 0, weightKg: 0, bodyFatPct: null })} />);
    expect(screen.getByText(/填好身体档案后自动测算/)).toBeInTheDocument();
    expect(screen.queryByText(/每日目标 0 kcal/)).not.toBeInTheDocument();
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

  it("lets the user define an ad-hoc custom food with auto-calculated kcal", () => {
    const controller = makeController();
    render(<MealSplitView controller={controller} foods={builtinFoods} templates={templates} />);

    fireEvent.click(screen.getByRole("button", { name: /添加食物/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /自定义食物/ }));

    // 填三大营养素：碳30/蛋20/脂5 → 热量自动 245 kcal/100g。
    const inputs = within(dialog).getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "30" } });
    fireEvent.change(inputs[1], { target: { value: "20" } });
    fireEvent.change(inputs[2], { target: { value: "5" } });
    expect(within(dialog).getByText(/245/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText("自定义食物"), { target: { value: "自制蛋白饼" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /添加此食物/ }));

    expect(controller.addCustomFoodToMeal).toHaveBeenCalledWith(
      controller.activeMealId,
      expect.objectContaining({ name: "自制蛋白饼", carbsPer100g: 30, proteinPer100g: 20, fatPer100g: 5 })
    );
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
