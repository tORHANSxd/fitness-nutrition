import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NutritionSummary } from "@/components/NutritionSummary";
import { FoodPickerDialog } from "@/components/FoodPickerDialog";
import { FoodShortcutsProvider } from "@/components/FoodShortcuts";
import type { FoodItem } from "@/lib/types";
const food: FoodItem = {
  id: "mine",
  name: "我的燕麦",
  category: "主食",
  source: "user",
  carbsPer100g: 60,
  proteinPer100g: 10,
  fatPer100g: 5,
  kcalPer100g: 325,
  weightBasis: "none",
};
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("shows excess rather than a misleading 100% label, and keeps an unset goal distinct", () => {
  render(
    <NutritionSummary
      total={{ kcal: 3000, carbs: 1000000, protein: 0.01, fat: 0 }}
      target={{ kcal: 2000, carbs: 0, protein: 100, fat: 0 }}
    />,
  );
  const energy = screen.getByRole("meter", { name: "热量目标完成比例" });
  expect(energy).toHaveAttribute("aria-valuenow", "100");
  expect(energy).toHaveAttribute("aria-valuetext", "150%，已超出目标");
  expect(screen.getByText("超出 1,000 kcal")).toBeInTheDocument();
  expect(screen.getAllByText("未设目标")).toHaveLength(2);
  expect(
    screen.getByRole("meter", { name: "碳水目标完成比例" }),
  ).toHaveAttribute("aria-valuetext", "未设置目标");
});
it("prioritizes personal foods and retains favorites for this account", () => {
  const publicFood = {
    ...food,
    id: "public-test",
    name: "公共燕麦",
    source: "public" as const,
  };
  const props = {
    open: true,
    foods: [publicFood, food],
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };
  const first = render(
    <FoodShortcutsProvider userId="account-a">
      <FoodPickerDialog {...props} />
    </FoodShortcutsProvider>,
  );
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("我的燕麦");
  fireEvent.click(screen.getByRole("button", { name: "设为常用我的燕麦" }));
  first.unmount();
  render(
    <FoodShortcutsProvider userId="account-a">
      <FoodPickerDialog {...props} />
    </FoodShortcutsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "常用" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByText("我的燕麦")).toBeInTheDocument();
});
it("does not expose one account's food shortcuts to another", () => {
  localStorage.setItem(
    "nutritrain:food-shortcuts:account-a",
    JSON.stringify({ recent: [food.id], favorites: [food.id] }),
  );
  render(
    <FoodShortcutsProvider userId="account-b">
      <FoodPickerDialog
        open
        foods={[food]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    </FoodShortcutsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "常用" }));
  expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
});
