import type { User } from "@supabase/supabase-js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NutritionGoalPanel } from "@/components/NutritionGoalPanel";
import { PlanProtocolPanel } from "@/components/PlanProtocolPanel";
import type { PlannerController } from "@/components/usePlanner";
import { defaultPreferences } from "@/lib/preferences";
import { createTreProtocol } from "@/lib/planPresets";
import { protocolMeals } from "@/lib/planProtocol";
import { buildNutritionResult } from "@/lib/nutrition";
import { emptyProfile } from "@/lib/demoState";
import { addDays, todayKey } from "@/lib/dateTime";
import { activatePlanProtocol, loadPlanProtocols } from "@/lib/protocolStorage";
import type { PlanProtocol } from "@/lib/types";
import { loadNutritionStandard, parseNutritionStandard } from "@/lib/nutritionStandard";
import { configureMealLayout } from "@/lib/mealLayout";
import { syntheticGoalProtocol, syntheticPolicy } from "../fixtures/nutritionGoalFixture";
import { syntheticStandard } from "../fixtures/nutritionStandardFixture";

vi.mock("@/lib/bodyLogs", () => ({ loadBodyLogs: vi.fn(async () => []) }));
vi.mock("@/lib/protocolStorage", () => ({ activatePlanProtocol: vi.fn(async (p: PlanProtocol) => p), loadPlanProtocols: vi.fn(async () => []), protocolSchemaReady: vi.fn(async () => true) }));
vi.mock("@/lib/nutritionStandard", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/nutritionStandard")>(), loadNutritionStandard: vi.fn(async () => null) }));
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
  fireEvent.click(screen.getByRole("button", { name: "帮我计算" }));
  fireEvent.click(screen.getByText("高级设置：公式与营养系数"));
  choose("计算所用性别", "male"); choose("总活动系数", "1.5");
  fireEvent.click(screen.getByLabelText(/我已成年/));
}
function preview() {
  choose("新目标生效日期", todayKey(preferences.timeZone));
  fireEvent.click(screen.getByRole("button", { name: "预览调整" }));
}
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadNutritionStandard).mockResolvedValue(null); });

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
  choose("我的目标", "lean_gain");
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

it.each([2, 4])("已保存的 %i 餐安排可载入三餐个人草案并预览，确认前保持原餐食", async count => {
  const p = props();
  const active = syntheticGoalProtocol();
  p.protocols = [active];
  p.controller.profile = { ...p.controller.profile, protocolSnapshot: active };
  p.controller.meals = configureMealLayout([], ["breakfast", "lunch", "dinner", "extra"].slice(0, count).map(id => ({ id, name: id, weights: { protein: 1, carbs: 1, fat: 1 } })), active.dailyTarget);
  p.controller.result = buildNutritionResult(p.controller.profile, p.controller.meals, []);
  const original = structuredClone(p.controller.meals);
  vi.mocked(loadNutritionStandard).mockResolvedValue(parseNutritionStandard(syntheticStandard));
  render(<NutritionGoalPanel {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "调整目标" }));
  fireEvent.click(screen.getByText("导入已有方案与周期设置"));
  fireEvent.click(await screen.findByRole("button", { name: "载入个人标准草案" }));
  fireEvent.change(screen.getByRole("combobox", { name: "恢复状态" }), { target: { value: "stable" } });
  preview();
  expect(screen.getByLabelText("自动目标应用预览").querySelectorAll(":scope > ul > li")).toHaveLength(3);
  expect(screen.getByLabelText("自动目标应用预览")).toHaveTextContent("下午加餐 16:00—16:30");
  expect(p.controller.meals).toEqual(original);
  expect(activatePlanProtocol).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认目标" }));
  await waitFor(() => expect(p.onApplied).toHaveBeenCalledOnce());
  expect((p.onApplied.mock.calls[0][0] as PlanProtocol).dailyTarget).toEqual(syntheticStandard.dailyTarget);
});

it("新用户无需填写活动系数或体脂即可得到可保存的目标", async () => {
  const p = props();
  render(<NutritionGoalPanel {...p} activeProtocol={null} />);
  expect(screen.getByRole("button", { name: "帮我计算" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("总活动系数", { exact: true })).not.toBeVisible();
  expect(screen.getByText("请选择计算所用性别，用于估算静息消耗。")).toBeVisible();
  choose("计算所用性别", "male");
  choose("日常活动水平", "1.4");
  fireEvent.click(screen.getByLabelText(/我已成年/));
  expect(screen.getByTestId("candidate-energy")).toHaveTextContent("2225 kcal");
  preview();
  fireEvent.click(screen.getByRole("button", { name: "确认目标" }));
  await waitFor(() => expect(p.onApplied).toHaveBeenCalledOnce());
  expect(p.onApplied.mock.calls[0][0].nutrition.policy.tdee).toEqual({ kind: "pal_total", multiplier: 1.4, includesExercise: true });
});

it("已有目标可直接填热量、蛋白质和脂肪，也可切换三大营养素输入", () => {
  render(<NutritionGoalPanel {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: "我已有目标" }));
  choose("每日热量", "2200"); choose("每日蛋白质 g", "170"); choose("每日脂肪 g", "60");
  fireEvent.click(screen.getByLabelText(/我已成年/));
  expect(screen.queryByLabelText("计算体重", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByTestId("candidate-carbs")).toHaveTextContent("245 g");
  choose("填写方式", "macros"); choose("每日碳水 g", "200");
  expect(screen.getByTestId("candidate-energy")).toHaveTextContent("2020 kcal");
  choose("填写方式", "energy");
  expect(screen.getByLabelText("每日热量", { exact: true })).toHaveValue("2020");
});

it("手动缺口支持全体重和去脂体重倍数，并保存精确输入", async () => {
  const p = props();
  render(<NutritionGoalPanel {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "我已有目标" }));
  choose("填写方式", "deficit"); choose("已知的维持热量", "2650"); choose("每日热量缺口（负为盈余）", "513");
  choose("蛋白方法", "ffm"); choose("计算体重", "90"); choose("体脂率 %", "20"); choose("蛋白系数 g/kg", "2.5");
  choose("脂肪方法", "body_weight"); choose("脂肪系数 g/kg", "0.6");
  fireEvent.click(screen.getByLabelText(/我已成年/));
  expect(screen.getByTestId("candidate-energy")).toHaveTextContent("2137 kcal");
  expect(screen.getByTestId("candidate-protein")).toHaveTextContent("180 g");
  expect(screen.getByTestId("candidate-fat")).toHaveTextContent("54 g");
  preview(); fireEvent.click(screen.getByRole("button", { name: "确认目标" }));
  await waitFor(() => expect(p.onApplied).toHaveBeenCalledOnce());
  const nutrition = (p.onApplied.mock.calls[0][0] as PlanProtocol).nutrition!;
  expect(nutrition.policy.policyVersion).toBe("nutrition-goals-v5.1");
  expect(nutrition.body.bodyFatWeightKg).toBe(90);
  expect(nutrition.body.bodyFatPct).toBe(20);
  expect(nutrition.result.resolvedTarget).toEqual({ kcal: 2137, protein: 180, fat: 54, carbs: 232.75 });
});

it("脂肪或蛋白可使用剩余预算，多项剩余时不生成预览", () => {
  render(<NutritionGoalPanel {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: "我已有目标" }));
  choose("每日热量", "2200"); choose("每日蛋白质 g", "180");
  choose("脂肪方法", "residual");
  expect(screen.getByRole("button", { name: "预览调整" })).toBeDisabled();
  choose("碳水方法", "fixed_grams"); choose("每日碳水 g", "250");
  expect(screen.getByTestId("candidate-fat")).toHaveTextContent("53.3 g");
  choose("脂肪方法", "fixed_grams"); choose("每日脂肪 g", "60"); choose("蛋白方法", "residual");
  expect(screen.getByTestId("candidate-protein")).toHaveTextContent("165 g");
});

it("日常目标与已保存日期分别显示，确认前明确不会覆盖今天", () => {
  const p = props();
  const latest = syntheticGoalProtocol();
  p.controller.meals[0].locked = true;
  render(<NutritionGoalPanel {...p} activeProtocol={latest} hasSavedPlan />);
  expect(screen.getByLabelText("今天的目标说明")).toHaveTextContent("2205 kcal");
  fireEvent.click(screen.getByRole("button", { name: "调整目标" }));
  fireEvent.click(screen.getByRole("button", { name: "我已有目标" }));
  choose("每日热量", "2300");
  preview();
  expect(screen.getByLabelText("自动目标应用预览")).toHaveTextContent("仍使用 2205 kcal");
  expect(screen.getByRole("button", { name: "确认目标" })).toBeEnabled();
  expect(p.controller.result.dailyTarget.kcal).toBe(2205);
});

it("重复选择当前输入方式不会重置目标或填写方式", () => {
  render(<NutritionGoalPanel {...props()} />);
  choose("我的目标", "lean_gain");
  fireEvent.click(screen.getByRole("button", { name: "帮我计算" }));
  expect(screen.getByLabelText("我的目标", { exact: true })).toHaveValue("lean_gain");
  fireEvent.click(screen.getByRole("button", { name: "我已有目标" }));
  choose("填写方式", "macros");
  choose("每日碳水 g", "200");
  fireEvent.click(screen.getByRole("button", { name: "我已有目标" }));
  expect(screen.getByLabelText("填写方式", { exact: true })).toHaveValue("macros");
  expect(screen.getByLabelText("每日碳水 g", { exact: true })).toHaveValue("200");
});

it("同一未来日期只展示最终会采用的目标版本", async () => {
  const p = props();
  const date = addDays(todayKey(preferences.timeZone), 1);
  const first = syntheticGoalProtocol({ date });
  const latest = syntheticGoalProtocol({ date, id: "20000000-0000-4000-8000-000000000052", previous: first, policy: syntheticPolicy("maintain") });
  vi.mocked(loadPlanProtocols).mockResolvedValue([first, latest]);
  render(<PlanProtocolPanel controller={p.controller} user={user} preferences={preferences} />);
  const upcoming = await screen.findAllByLabelText("待生效的日常目标");
  expect(upcoming).toHaveLength(1);
  expect(upcoming[0]).toHaveTextContent("2825 kcal");
});

it("身体信息载入完成后才初始化计算表单，避免带入临时示例值", async () => {
  const p = props();
  p.controller.draftState = "loading";
  vi.mocked(loadPlanProtocols).mockResolvedValue([syntheticGoalProtocol({ date: addDays(todayKey(preferences.timeZone), 1) })]);
  const { rerender } = render(<PlanProtocolPanel controller={p.controller} user={user} preferences={preferences} />);
  await screen.findByLabelText("待生效的日常目标");
  expect(screen.queryByLabelText("计算体重", { exact: true })).not.toBeInTheDocument();
  const hydrated = { ...p.controller, draftState: "ready" as const, profile: { ...p.controller.profile, weightKg: 82 } };
  rerender(<PlanProtocolPanel controller={hydrated} user={user} preferences={preferences} />);
  expect(await screen.findByLabelText("计算体重", { exact: true })).toHaveValue("82");
});
