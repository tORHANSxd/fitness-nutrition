import type { User } from "@supabase/supabase-js";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePlanner, type UsePlannerArgs } from "@/components/usePlanner";
import { emptyProfile } from "@/lib/demoState";
import { createDefaultMeals, buildNutritionResult } from "@/lib/nutrition";
import { loadPlannerDraft, savePlannerDraft } from "@/lib/storage";
import { UnsupportedDocumentError } from "@/lib/planProtocol";
import { protocolMeals } from "@/lib/planProtocol";
import { syntheticGoalProtocol, syntheticPolicy } from "./helpers/nutritionGoalFixture";
import { loadPlanProtocols } from "@/lib/protocolStorage";
import { configureMealLayout, mealLayoutDraft } from "@/lib/mealLayout";
import { materializeDayTemplate } from "@/lib/templates";
import type { SavedPlan } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/bodyLogs", () => ({ loadBodyLogs: vi.fn(async () => []), mergeLatestBodyMetrics: (profile: unknown) => profile }));
vi.mock("@/lib/protocolStorage", () => ({ loadPlanProtocols: vi.fn(async () => []) }));
vi.mock("@/lib/storage", () => ({ loadPlannerDraft: vi.fn(), savePlannerDraft: vi.fn(async () => ({ revision: 5 })), savePlan: vi.fn(), PlannerDraftConflictError: class extends Error {} }));

const profile = { ...emptyProfile, planDate: "2030-01-03" };
const meals = createDefaultMeals(profile);
const savedPlan: SavedPlan = { id: "saved", profile, meals, planDate: profile.planDate, result: buildNutritionResult(profile, meals, []), createdAt: "", updatedAt: "", schemaVersion: 2, algorithmVersion: null, integrityFlags: [] };
const args: UsePlannerArgs = { foods: [], templates: { mealTemplates: [], dayTemplates: [] }, user: { id: "fixture-user" } as User, timeZone: "Asia/Shanghai", onTemplatesChanged: vi.fn(), openDateRequest: { date: profile.planDate, plan: savedPlan, nonce: 1 } };
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadPlanProtocols).mockResolvedValue([]);
  vi.mocked(loadPlannerDraft).mockResolvedValue({ profile, meals: meals.map((m, i) => i ? m : { ...m, name: "草稿餐", schedule: { start: "12:00", end: "12:30", endDayOffset: 0 } }), updatedAt: "", revision: 4, schemaVersion: 2 });
});

it("刷新优先同日草稿，保留未手动保存的餐次时间", async () => {
  const { result } = renderHook(() => usePlanner(args));
  await waitFor(() => expect(result.current.draftState).toBe("ready"));
  expect(result.current.meals[0].name).toBe("草稿餐");
  expect(result.current.meals[0].schedule?.start).toBe("12:00");
  expect(savePlannerDraft).not.toHaveBeenCalled();
});

it("打开其他日期不写回草稿，实际编辑后才以已读 revision 保存", async () => {
  const { result, rerender } = renderHook((props: UsePlannerArgs) => usePlanner(props), { initialProps: args });
  await waitFor(() => expect(result.current.draftState).toBe("ready"));
  rerender({ ...args, openDateRequest: { date: "2030-01-04", plan: null, nonce: 2 } });
  await waitFor(() => expect(result.current.profile.planDate).toBe("2030-01-04"));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1300)); });
  expect(savePlannerDraft).not.toHaveBeenCalled();
  act(() => result.current.updateMeal(result.current.meals[0].id, m => ({ ...m, name: "明确编辑" })));
  await waitFor(() => expect(savePlannerDraft).toHaveBeenCalled(), { timeout: 2500 });
  expect(vi.mocked(savePlannerDraft).mock.calls[0][3]?.expectedRevision).toBe(4);
});

it("未知草稿保留原文，日期请求不能解锁自动写入", async () => {
  const raw = { schema_version: 99, payload: "future" };
  vi.mocked(loadPlannerDraft).mockRejectedValue(new UnsupportedDocumentError("未来版本", raw));
  const { result } = renderHook(() => usePlanner(args));
  await waitFor(() => expect(result.current.draftState).toBe("error"));
  expect(result.current.rawDocument).toBe(raw);
  expect(savePlannerDraft).not.toHaveBeenCalled();
});

it("D02/D06 未保存日期刷新采用已生效协议，候选体测和旧草稿不改其数值", async () => {
  const first = syntheticGoalProtocol({ date: "2030-01-01" });
  const next = syntheticGoalProtocol({ date: profile.planDate, id: "20000000-0000-4000-8000-000000000061", previous: first, policy: syntheticPolicy("lean_gain") });
  const oldProfile = { ...profile, targetMode: "calibrated" as const, allocationMode: "explicitMacros" as const, protocolSnapshot: first };
  const oldMeals = protocolMeals(first);
  oldMeals[0].entries = [{ id: "synthetic-entry", foodId: "missing-food", grams: 100, locked: true }];
  vi.mocked(loadPlannerDraft).mockResolvedValue({ profile: oldProfile, meals: oldMeals, updatedAt: "", revision: 4, schemaVersion: 3 });
  vi.mocked(loadPlanProtocols).mockResolvedValue([first, next]);
  const props: UsePlannerArgs = { ...args, openDateRequest: { date: profile.planDate, plan: null, nonce: 1 } };
  const { result } = renderHook(() => usePlanner(props));
  await waitFor(() => expect(result.current.profile.protocolSnapshot?.id).toBe(next.id));
  expect(result.current.result.dailyTarget).toEqual(next.dailyTarget);
  expect(result.current.meals[0].entries).toEqual(oldMeals[0].entries);
  expect(savePlannerDraft).not.toHaveBeenCalled();
});

it("D04/D07 同日食品草稿优先，但已保存日期的目标不会被新协议改写", async () => {
  const { result } = renderHook(() => usePlanner(args));
  await waitFor(() => expect(result.current.draftState).toBe("ready"));
  const before = structuredClone(result.current.result.dailyTarget);
  const newGoal = syntheticGoalProtocol({ date: profile.planDate });
  act(() => result.current.applyProtocol?.(newGoal));
  expect(result.current.result.dailyTarget).toEqual(before);
  expect(result.current.meals[0].name).toBe("草稿餐");
  expect(result.current.message).toContain("冻结");
});

it("D12 食品模板保持协议目标、各宏量分配和餐时", async () => {
  const goal = syntheticGoalProtocol({ date: profile.planDate });
  const goalProfile = { ...profile, targetMode: "calibrated" as const, allocationMode: "explicitMacros" as const, protocolSnapshot: goal };
  const goalMeals = protocolMeals(goal);
  vi.mocked(loadPlannerDraft).mockResolvedValue({ profile: goalProfile, meals: goalMeals, updatedAt: "", revision: 4, schemaVersion: 3 });
  vi.mocked(loadPlanProtocols).mockResolvedValue([goal]);
  const props = { ...args, openDateRequest: { date: profile.planDate, plan: null, nonce: 1 } };
  const { result, rerender } = renderHook((p: UsePlannerArgs) => usePlanner(p), { initialProps: props });
  await waitFor(() => expect(result.current.draftState).toBe("ready"));
  const incoming = goalMeals.map(m => ({ ...m, name: "旧食品模板", targetAllocation: { protein: .5, fat: .5, carbs: .5 }, schedule: { start: "09:00", end: "09:30", endDayOffset: 0 as const } }));
  rerender({ ...props, applyRequest: { meals: incoming, nonce: 1 } });
  expect(result.current.result.dailyTarget).toEqual(goal.dailyTarget);
  expect(result.current.meals.map(m => [m.name, m.schedule, m.targetAllocation])).toEqual(goalMeals.map(m => [m.name, m.schedule, m.targetAllocation]));
});

it("自定义餐数和名称保存成完整模板，训练时间修改不重置分餐", async () => {
  const { result, rerender } = renderHook((p: UsePlannerArgs) => usePlanner(p), { initialProps: args });
  await waitFor(() => expect(result.current.draftState).toBe("ready"));
  const slots = mealLayoutDraft(result.current.meals).slice(0, 2);
  slots[0].name = "午后第一餐"; slots[1].name = "晚间恢复餐";
  act(() => { expect(result.current.updateMealLayout(slots)).toBe(true); });
  await act(async () => result.current.updateProfile("trainingTime", "morning"));
  expect(result.current.meals.map(m => m.name)).toEqual(["午后第一餐", "晚间恢复餐"]);
  act(() => result.current.saveDayTemplate("我的两餐"));
  const saved = vi.mocked(args.onTemplatesChanged).mock.calls.at(-1)![0];
  expect(saved.dayTemplates[0].includesMealLayout).toBe(true);
  expect(saved.dayTemplates[0].name).toBe("我的两餐");
  rerender({ ...args, templates: saved });
  const expanded = [...slots, { id: "third", name: "临时加餐", weights: { protein: 1, carbs: 1, fat: 1 } }];
  act(() => { expect(result.current.updateMealLayout(expanded)).toBe(true); });
  act(() => result.current.applyDayTemplate(saved.dayTemplates[0].id));
  expect(result.current.meals.map(m => m.name)).toEqual(["午后第一餐", "晚间恢复餐"]);
  expect(result.current.meals[0].schedule?.start).toBe("12:00");
  await waitFor(() => expect(savePlannerDraft).toHaveBeenCalled(), { timeout: 2500 });
  const last = vi.mocked(savePlannerDraft).mock.calls.at(-1)!;
  expect(last[0]).toMatchObject({ allocationMode: "explicitMacros" });
  expect(last[1]).toEqual(result.current.meals);
});

it("完整模板等待日期载入后应用，保持冻结日目标，重复请求不覆盖后续编辑", async () => {
  const goal = syntheticGoalProtocol({ date: profile.planDate });
  const goalProfile = { ...profile, targetMode: "calibrated" as const, allocationMode: "explicitMacros" as const, protocolSnapshot: goal };
  const current = protocolMeals(goal);
  vi.mocked(loadPlannerDraft).mockResolvedValue({ profile: goalProfile, meals: current, updatedAt: "", revision: 4, schemaVersion: 3 });
  vi.mocked(loadPlanProtocols).mockResolvedValue([goal]);
  const custom = configureMealLayout(current, mealLayoutDraft(current).slice(0, 2).map((s, i) => ({ ...s, name: `模板餐${i + 1}` })), goal.dailyTarget);
  const request = { meals: custom, includesMealLayout: true, nonce: 9 };
  const props: UsePlannerArgs = { ...args, suspendWrites: true, applyRequest: request, openDateRequest: { date: profile.planDate, plan: null, nonce: 7 } };
  const { result, rerender } = renderHook((p: UsePlannerArgs) => usePlanner(p), { initialProps: props });
  await waitFor(() => expect(result.current.draftState).toBe("ready"));
  expect(result.current.meals).toHaveLength(3);
  rerender({ ...props, suspendWrites: false });
  await waitFor(() => expect(result.current.meals).toHaveLength(2));
  expect(result.current.profile.protocolSnapshot).toEqual(goal);
  expect(result.current.result.dailyTarget).toEqual(goal.dailyTarget);
  act(() => result.current.updateMeal(custom[0].id, m => ({ ...m, name: "后续编辑" })));
  rerender({ ...props, suspendWrites: false, applyRequest: { ...request, meals: structuredClone(custom) } });
  expect(result.current.meals[0].name).toBe("后续编辑");
});

it("刷新未手动保存的 legacy 显式布局保留分配模式，其他历史日期仍加载原餐次", async () => {
  const custom = configureMealLayout(meals, mealLayoutDraft(meals).slice(0, 2), savedPlan.result.dailyTarget);
  vi.mocked(loadPlannerDraft).mockResolvedValue({ profile: { ...profile, allocationMode: "explicitMacros" }, meals: custom, updatedAt: "", revision: 4, schemaVersion: 3 });
  const { result, rerender } = renderHook((p: UsePlannerArgs) => usePlanner(p), { initialProps: args });
  await waitFor(() => expect(result.current.draftState).toBe("ready"));
  expect(result.current.profile.allocationMode).toBe("explicitMacros");
  expect(result.current.meals).toEqual(custom);
  const historical = { ...savedPlan, planDate: "2029-12-31", profile: { ...profile, planDate: "2029-12-31" } };
  rerender({ ...args, openDateRequest: { date: historical.planDate, plan: historical, nonce: 8 } });
  expect(result.current.meals).toEqual(savedPlan.meals);
  expect(result.current.profile.allocationMode).toBeUndefined();
  expect(savePlannerDraft).not.toHaveBeenCalled();
});

it("新完整模板不覆盖当前锁定餐食，无效布局不修改当前计划", async () => {
  const { result, rerender } = renderHook((p: UsePlannerArgs) => usePlanner(p), { initialProps: args });
  await waitFor(() => expect(result.current.draftState).toBe("ready"));
  act(() => result.current.saveDayTemplate("测试锁定模板"));
  const templates = vi.mocked(args.onTemplatesChanged).mock.calls.at(-1)![0];
  rerender({ ...args, templates });
  act(() => result.current.updateMeal(result.current.meals[0].id, m => ({ ...m, locked: true })));
  const before = result.current.meals;
  act(() => result.current.applyDayTemplate(templates.dayTemplates[0].id));
  expect(result.current.meals).toBe(before);
  expect(result.current.message).toContain("解锁");
  act(() => { expect(result.current.updateMealLayout([])).toBe(false); });
  expect(result.current.meals).toBe(before);
  expect(materializeDayTemplate(templates.dayTemplates[0], new Map())).toHaveLength(before.length);
});

it("撤销复制或删除仅影响当前日期，换日后不能恢复到旧日期", async () => {
  const { result, rerender } = renderHook((props: UsePlannerArgs) => usePlanner(props), {initialProps:args});
  await waitFor(() => expect(result.current.draftState).toBe("ready"));
  const original = structuredClone(result.current.meals);
  act(() => result.current.replaceMeals?.([{...original[0],id:"copied",name:"复制餐",entries:[]} ]));
  expect(result.current.canUndo).toBe(true);
  expect(result.current.meals[0].name).toBe("复制餐");
  act(() => result.current.undoLastChange?.());
  expect(result.current.meals).toEqual(original);
  act(() => result.current.replaceMeals?.([{...original[0],id:"copied",name:"复制餐",entries:[]} ]));
  rerender({...args,openDateRequest:{date:"2030-01-04",plan:null,nonce:2}});
  await waitFor(() => expect(result.current.profile.planDate).toBe("2030-01-04"));
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.undoLastChange?.());
  expect(result.current.profile.planDate).toBe("2030-01-04");
});
