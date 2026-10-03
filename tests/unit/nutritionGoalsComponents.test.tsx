import type { User } from "@supabase/supabase-js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NutritionGoalPanel } from "@/components/NutritionGoalPanel";
import type { PlannerController } from "@/components/usePlanner";
import { defaultPreferences } from "@/lib/preferences";
import { createTreProtocol } from "@/lib/planPresets";
import { protocolMeals } from "@/lib/planProtocol";
import { buildNutritionResult } from "@/lib/nutrition";
import { emptyProfile } from "@/lib/demoState";
import { todayKey } from "@/lib/dateTime";
import { activatePlanProtocol } from "@/lib/protocolStorage";
import type { PlanProtocol } from "@/lib/types";

vi.mock("@/lib/bodyLogs", () => ({ loadBodyLogs: vi.fn(async () => []) }));
vi.mock("@/lib/protocolStorage", () => ({ activatePlanProtocol: vi.fn(async (p: PlanProtocol) => p) }));
const preferences = defaultPreferences({ timeZone: "Asia/Shanghai" });
const user = { id: "synthetic-user" } as User;
function props() {
  const fixed = createTreProtocol({ id: "20000000-0000-4000-8000-000000000090", effectiveFrom: "2025-01-01", cycleAnchorDate: "2025-01-01", timeZone: "Asia/Shanghai" });
  const profile = { ...emptyProfile, planDate: todayKey(preferences.timeZone), weightKg: 90, heightCm: 180, age: 30, targetMode: "calibrated" as const, allocationMode: "explicitMacros" as const, protocolSnapshot: fixed };
  const meals = protocolMeals(fixed);
  const controller = { profile, meals, result: buildNutritionResult(profile, meals, []), foodsById: new Map(), updateMeal: vi.fn() } as unknown as PlannerController;
  return { controller, user, preferences, protocols: [fixed], ready: true, onApplied: vi.fn() };
}
const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
function begin() {
  fireEvent.click(screen.getByRole("button", { name: "按身体数据计算" }));
  choose("计算所用性别", "male"); choose("总活动系数", "1.5");
  fireEvent.click(screen.getByLabelText(/我已成年/));
}
function preview() {
  choose("新目标生效日期", todayKey(preferences.timeZone));
  fireEvent.click(screen.getByRole("button", { name: "预览调整" }));
}
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

it("S10 full kcal/kJ and kg/lb display round-trip never writes rounded values into policy/body", async () => {
  const p = props(); const { rerender } = render(<NutritionGoalPanel {...p} />); begin();
  choose("计算体重", "90.123456");
  const kcal = screen.getByTestId("candidate-energy").textContent;
  rerender(<NutritionGoalPanel {...p} preferences={{ ...preferences, unitSystem: "imperial", energyUnit: "kj" }} />);
  expect(screen.getByLabelText("计算体重", { exact: true })).not.toHaveValue("90.123456");
  rerender(<NutritionGoalPanel {...p} />);
  expect(screen.getByTestId("candidate-energy")).toHaveTextContent(kcal!);
  preview(); fireEvent.click(screen.getByRole("button", { name: "确认目标" }));
  await waitFor(() => expect(p.onApplied).toHaveBeenCalledOnce());
  const protocol = p.onApplied.mock.calls[0][0] as PlanProtocol;
  expect(protocol.nutrition!.body.weightKg).toBe(90.123456);
  expect(protocol.nutrition!.policy.protein).toEqual({ kind: "body_weight", coefficient: 1.9 });
});

it("U04 restoring a scenario default explicitly clears fixed fields", () => {
  render(<NutritionGoalPanel {...props()} />); begin();
  choose("蛋白方法", "fixed_grams"); choose("手动蛋白 g", "175");
  choose("我的目标场景", "lean_gain");
  expect(screen.getByRole("button", { name: "保留手动项" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "全部采用场景默认" }));
  expect(screen.getByLabelText("蛋白方法", { exact: true })).toHaveValue("body_weight");
  expect(screen.getByTestId("candidate-energy")).toHaveTextContent("2950 kcal");
  expect(screen.getByTestId("candidate-protein")).toHaveTextContent("160 g");
});

it("U09 a whole-meal lock conflict blocks activation rather than changing its absolute target", () => {
  const p = props(); p.controller.meals[0].locked = true;
  render(<NutritionGoalPanel {...p} />); begin(); preview();
  expect(screen.getByRole("alert")).toHaveTextContent("请先解除固定");
  expect(screen.getByRole("button", { name: "确认目标" })).toBeDisabled();
  expect(activatePlanProtocol).not.toHaveBeenCalled();
  expect(p.controller.result.dailyTarget.kcal).toBe(2205);
});

it("D10 an unavailable schema permits calculation, but cannot fake a successful save", () => {
  render(<NutritionGoalPanel {...props()} ready={false} />); begin(); preview();
  expect(screen.getByTestId("candidate-energy")).toHaveTextContent("2400 kcal");
  expect(screen.getByRole("button", { name: "确认目标" })).toBeDisabled();
  expect(activatePlanProtocol).not.toHaveBeenCalled();
});

it("a changed calculation time zone invalidates a previously reviewable request", () => {
  const p = props(); const { rerender } = render(<NutritionGoalPanel {...p} />); begin(); preview();
  expect(screen.getByRole("button", { name: "确认目标" })).toBeEnabled();
  rerender(<NutritionGoalPanel {...p} preferences={{ ...preferences, timeZone: "America/Los_Angeles" }} />);
  expect(screen.getByRole("button", { name: "确认目标" })).toBeDisabled();
  expect(screen.getByText("计算依据或餐食已改变，请重新生成预览。")).toBeVisible();
});
