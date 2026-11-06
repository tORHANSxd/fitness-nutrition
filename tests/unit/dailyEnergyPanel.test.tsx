import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DailyEnergyPanel } from "@/components/DailyEnergyPanel";
import type { PlannerController } from "@/components/usePlanner";
import { emptyProfile } from "@/lib/demoState";
import { buildNutritionResult } from "@/lib/nutrition";
import { syntheticGoalProtocol } from "../fixtures/nutritionGoalFixture";
import { protocolMeals } from "@/lib/planProtocol";
import { NumericDraftProvider, useNumericDraftForm } from "@/components/NumericInput";

afterEach(cleanup);
function controller() {
  const protocol = syntheticGoalProtocol();
  const profile = { ...emptyProfile, planDate: "2026-01-02", targetMode: "calibrated" as const, allocationMode: "explicitMacros" as const, protocolSnapshot: protocol };
  return { profile, result: buildNutritionResult(profile, protocolMeals(protocol), []), applyDailyEnergyAdjustment: vi.fn(), saving: false, message: "" } as unknown as PlannerController;
}
it("kJ 输入按kcal保存，零缺口可选，超预算不可保存", () => {
  const c = controller();
  render(<DailyEnergyPanel controller={c} energyUnit="kj" />);
  fireEvent.click(screen.getByText("仅调整这一天"));
  fireEvent.change(screen.getByLabelText("估算维持热量"), { target: { value: "11087.6" } });
  fireEvent.blur(screen.getByLabelText("估算维持热量"));
  fireEvent.change(screen.getByLabelText("当天缺口"), { target: { value: "3347.2" } });
  fireEvent.blur(screen.getByLabelText("当天缺口"));
  fireEvent.click(screen.getByRole("button", { name: "保存当天目标" }));
  const saved = vi.mocked(c.applyDailyEnergyAdjustment!).mock.calls[0][0]!;
  expect(saved.tdeeKcal).toBeCloseTo(2650, 8);
  expect(saved.deficitKcal).toBeCloseTo(800, 8);
  fireEvent.click(screen.getByRole("button", { name: "今天吃到维持热量" }));
  fireEvent.click(screen.getByRole("button", { name: "保存当天目标" }));
  expect(c.applyDailyEnergyAdjustment).toHaveBeenLastCalledWith({ tdeeKcal: 2650, deficitKcal: 0 });
  fireEvent.change(screen.getByLabelText("当天缺口"), { target: { value: "8368" } });
  fireEvent.blur(screen.getByLabelText("当天缺口"));
  expect(screen.getByRole("alert")).toHaveTextContent("超过当天热量预算");
  expect(screen.getByRole("button", { name: "保存当天目标" })).toBeDisabled();
});

it("缺口输入只校验自己的保存操作，未确认的数字不能保存旧值", () => {
  const c = controller(), savePlan = vi.fn();
  c.profile.protocolSnapshot!.nutrition!.result.expenditure.tdeeKcal = null;
  function Harness() {
    const form = useNumericDraftForm();
    return <NumericDraftProvider form={form}><DailyEnergyPanel controller={c} energyUnit="kcal" /><button onClick={() => { if (form.validateAll()) savePlan(); }}>保存计划</button></NumericDraftProvider>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText("仅调整这一天"));
  expect(screen.getByLabelText("估算维持热量")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "保存计划" }));
  expect(savePlan).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText("估算维持热量"), { target: { value: "2650" } });
  fireEvent.focus(screen.getByLabelText("当天缺口"));
  fireEvent.change(screen.getByLabelText("当天缺口"), { target: { value: "800." } });
  fireEvent.click(screen.getByRole("button", { name: "保存当天目标" }));
  expect(c.applyDailyEnergyAdjustment).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("当天缺口不是完整数字");
});

it("默认显示目标来源，临时调整收起且不写入数据", () => {
  const c = controller();
  render(<DailyEnergyPanel controller={c} energyUnit="kcal" />);
  expect(screen.getByLabelText("当天目标来源")).toHaveTextContent("日常目标");
  expect(screen.getByLabelText("当天缺口")).not.toBeVisible();
  expect(c.applyDailyEnergyAdjustment).not.toHaveBeenCalled();
});

it("当天可手填身体信息和倍数，固定摄入不要求虚构维持热量", () => {
  const c = controller();
  c.profile.protocolSnapshot!.nutrition!.result.expenditure.tdeeKcal = null;
  render(<DailyEnergyPanel controller={c} energyUnit="kcal" />);
  fireEvent.click(screen.getByText("仅调整这一天"));
  const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
  change("当天热量方式", "fixed"); change("当天摄入热量", "2200");
  fireEvent.click(screen.getByLabelText("单独调整当天体重、体脂和三大营养素"));
  change("当天计算体重", "90"); change("当天体脂率", "20");
  change("蛋白方法", "ffm"); change("蛋白系数 g/kg", "2.5");
  change("脂肪方法", "body_weight"); change("脂肪系数 g/kg", "0.6");
  expect(screen.getByLabelText("当天目标预览")).toHaveTextContent("碳水 248.5 g · 蛋白质 180.0 g · 脂肪 54.0 g");
  fireEvent.click(screen.getByRole("button", { name: "保存当天目标" }));
  expect(c.applyDailyEnergyAdjustment).toHaveBeenLastCalledWith({ targetKcal: 2200, macroInputs: { version: 1, weightKg: 90, bodyFatPct: 20, protein: { kind: "ffm", coefficient: 2.5 }, fat: { kind: "body_weight", coefficient: .6 }, carbs: { kind: "residual" } } });
  change("蛋白方法", "residual");
  expect(screen.getByRole("button", { name: "保存当天目标" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("最多只能选择一项");
});

it("已存当天规则载入后仍可切换剩余项或直接去脂体重", () => {
  const c = controller();
  c.profile.dailyEnergyAdjustment = { targetKcal: 2200, macroInputs: { version: 1, weightKg: 90, bodyFatPct: null, ffmInput: "direct", ffmKg: 72, protein: { kind: "ffm", coefficient: 2.5 }, fat: { kind: "fixed_grams", grams: 60 }, carbs: { kind: "residual" } } };
  render(<DailyEnergyPanel controller={c} energyUnit="kcal" />);
  fireEvent.click(screen.getByText("仅调整这一天"));
  expect(screen.getByLabelText("当天热量方式")).toHaveValue("fixed");
  expect(screen.getByLabelText("当天去脂体重", { exact: true })).toHaveValue("72");
  expect(screen.getByLabelText("蛋白方法")).toHaveValue("ffm");
  fireEvent.click(screen.getByRole("button", { name: "保存当天目标" }));
  expect(c.applyDailyEnergyAdjustment).toHaveBeenLastCalledWith(c.profile.dailyEnergyAdjustment);
});
