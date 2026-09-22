import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MealSplitView } from "@/components/MealSplitView";
import { usePlanner } from "@/components/usePlanner";
import { builtinFoods } from "@/lib/foods";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);
function Planner() {
  const templates = { mealTemplates: [], dayTemplates: [] };
  const controller = usePlanner({ foods: builtinFoods, templates, user: null, timeZone: "Asia/Shanghai", onTemplatesChanged: vi.fn() });
  return <MealSplitView controller={controller} foods={builtinFoods} templates={templates} />;
}
it("keeps the food lock next to its weight and exposes the meal lock without opening settings", () => {
  render(<Planner />);
  const weight = screen.getAllByLabelText(/克重$/)[0];
  const name = weight.getAttribute("aria-label")!.replace(/克重$/, "");
  const lock = screen.getByRole("button", { name: `锁定${name}分量` });
  expect(lock.closest("details")).toBeNull();
  expect(lock.parentElement).toContainElement(weight);
  const initial = lock.getAttribute("aria-pressed");
  fireEvent.click(lock);
  expect(lock).toHaveAttribute("aria-pressed", initial === "true" ? "false" : "true");
  const mealLock = screen.getByRole("button", { name: "锁定整餐" });
  expect(mealLock.closest("details")).toBeNull();
  fireEvent.click(mealLock);
  expect(mealLock).toHaveAttribute("aria-pressed", "true");
  expect(lock).toBeDisabled();
  expect(lock).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(mealLock);
  expect(lock).toBeEnabled();
});
