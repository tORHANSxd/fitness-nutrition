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
  fireEvent.change(screen.getByLabelText("估算维持热量"), { target: { value: "11087.6" } });
  fireEvent.blur(screen.getByLabelText("估算维持热量"));
  fireEvent.change(screen.getByLabelText("当天缺口"), { target: { value: "3347.2" } });
  fireEvent.blur(screen.getByLabelText("当天缺口"));
  fireEvent.click(screen.getByRole("button", { name: "保存当天目标" }));
  const saved = vi.mocked(c.applyDailyEnergyAdjustment!).mock.calls[0][0]!;
  expect(saved.tdeeKcal).toBeCloseTo(2650, 8);
  expect(saved.deficitKcal).toBeCloseTo(800, 8);
  fireEvent.click(screen.getByRole("button", { name: "维持" }));
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
