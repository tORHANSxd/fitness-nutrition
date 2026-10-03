import type { User } from "@supabase/supabase-js";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MealSplitView } from "@/components/MealSplitView";
import { DailyCheckinPanel } from "@/components/DailyCheckinPanel";
import { usePlanner } from "@/components/usePlanner";
import { emptyProfile } from "@/lib/demoState";
import { buildNutritionResult, createDefaultMeals } from "@/lib/nutrition";
import { completeDailyRecord, loadPlansInRange } from "@/lib/storage";
import type { SavedPlan } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/bodyLogs", () => ({ loadBodyLogs: vi.fn(async () => []), mergeLatestBodyMetrics: (profile: unknown) => profile }));
vi.mock("@/lib/protocolStorage", () => ({ loadPlanProtocols: vi.fn(async () => []) }));
vi.mock("@/lib/storage", () => ({ loadPlansInRange: vi.fn(), loadPlannerDraft: vi.fn(async () => null), savePlannerDraft: vi.fn(async () => ({ revision: 1 })), savePlan: vi.fn(), loadDailyCheckin: vi.fn(async () => null), completeDailyRecord: vi.fn(), PlannerDraftConflictError: class extends Error {} }));

const user = { id: "copy-fixture-user" } as User;
const templates = { mealTemplates: [], dayTemplates: [] };
const profile = { ...emptyProfile, planDate: "2030-01-01" };
const meals = createDefaultMeals(profile).map(meal => ({ ...meal, name: `来源${meal.name}` }));
const source: SavedPlan = { id: "source", planDate: profile.planDate, profile, meals, result: buildNutritionResult(profile, meals, []), schemaVersion: 2, algorithmVersion: null, integrityFlags: [], createdAt: "", updatedAt: "" };

function Planner({ valid = true, showCheckin = false }: { valid?: boolean; showCheckin?: boolean }) {
  const controller = usePlanner({ foods: [], templates, user, timeZone: "Asia/Shanghai", onTemplatesChanged: vi.fn(), validateNumericDrafts: () => valid });
  return <><MealSplitView controller={controller} foods={[]} templates={templates} user={user} />{showCheckin && <DailyCheckinPanel controller={controller} date={controller.profile.planDate} today={controller.profile.planDate} user={user} energyUnit="kcal" />}</>;
}

async function openCopy() {
  await act(async () => { render(<Planner />); });
  fireEvent.click(screen.getByRole("button", { name: /复制其他日期/ }));
  fireEvent.change(screen.getByLabelText("复制来源日期"), { target: { value: source.planDate } });
  fireEvent.click(screen.getByRole("button", { name: "预览" }));
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadPlansInRange).mockResolvedValue([structuredClone(source)]); });
afterEach(cleanup);

it("预览不修改当前餐食，确认复制后使用独立条目并可撤销", async () => {
  await openCopy();
  await screen.findByText("将载入 3 餐");
  expect(screen.queryByRole("tab", { name: /来源/ })).not.toBeInTheDocument();
  expect(loadPlansInRange).toHaveBeenCalledWith(user, source.planDate, source.planDate);
  fireEvent.click(screen.getByRole("button", { name: "确认替换餐食" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getAllByRole("tab", { name: /来源/ })).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.queryByRole("tab", { name: /来源/ })).not.toBeInTheDocument();
});

it("替换被数字校验拒绝时保留弹窗和预览并显示原因", async () => {
  await act(async () => { render(<Planner valid={false} />); });
  fireEvent.click(screen.getByRole("button", { name: /复制其他日期/ }));
  fireEvent.change(screen.getByLabelText("复制来源日期"), { target: { value: source.planDate } });
  fireEvent.click(screen.getByRole("button", { name: "预览" }));
  await screen.findByText("将载入 3 餐");
  fireEvent.click(screen.getByRole("button", { name: "确认替换餐食" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("数字");
  expect(screen.queryByRole("tab", { name: /来源/ })).not.toBeInTheDocument();
});

it("关闭读取中的复制弹窗后，旧请求不能污染餐食设置或下一次复制", async () => {
  let resolve!: (plans: SavedPlan[]) => void;
  vi.mocked(loadPlansInRange).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await openCopy();
  fireEvent.click(screen.getByRole("button", { name: "关闭复制其他日期的餐食" }));
  fireEvent.click(screen.getByRole("button", { name: "餐食更多操作" }));
  await act(async () => resolve([source]));
  expect(screen.queryByText("将载入 3 餐")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "关闭餐食设置" }));
  fireEvent.click(screen.getByRole("button", { name: /复制其他日期/ }));
  expect(screen.getByRole("button", { name: "预览" })).toBeEnabled();
  expect(screen.queryByText("将载入 3 餐")).not.toBeInTheDocument();
});

it("读取异常展示原因，重新选择日期清除旧错误并允许重试", async () => {
  vi.mocked(loadPlansInRange).mockRejectedValueOnce(new Error("来源餐食版本不支持"));
  await openCopy();
  expect(await screen.findByRole("alert")).toHaveTextContent("来源餐食版本不支持");
  fireEvent.change(screen.getByLabelText("复制来源日期"), { target: { value: "2030-01-02" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "预览" }));
  await screen.findByText("将载入 3 餐");
});

it("没有已保存餐食时给出空状态，当前计划保持不变", async () => {
  vi.mocked(loadPlansInRange).mockResolvedValueOnce([]);
  await openCopy();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("没有保存餐食计划"));
  expect(screen.queryByRole("button", { name: "确认替换餐食" })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /来源/ })).not.toBeInTheDocument();
});

it.each([true, false])("复制后保存计划=%s，完成记录再撤销也不会降低计划版本", async (saveBeforeCompletion) => {
  vi.mocked(completeDailyRecord).mockImplementation(async (p, _m, _r, actual, target, _user, _foods, _revision, minimumSchemaVersion) => {
    if (minimumSchemaVersion !== 3) throw new Error("unsupported_plan_schema");
    return { id: "completed-copy", planDate: p.planDate, actual, target, completed: true, createdAt: "", updatedAt: "" };
  });
  await act(async () => { render(<Planner showCheckin />); });
  fireEvent.click(screen.getByRole("button", { name: /复制其他日期/ }));
  fireEvent.change(screen.getByLabelText("复制来源日期"), { target: { value: source.planDate } });
  fireEvent.click(screen.getByRole("button", { name: "预览" }));
  await screen.findByText("将载入 3 餐");
  fireEvent.click(screen.getByRole("button", { name: "确认替换餐食" }));
  if (saveBeforeCompletion) {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "保存计划" })); });
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "保存计划" })); });
  }
  fireEvent.click(screen.getByRole("button", { name: "完成记录" }));
  expect(await screen.findByText("当日记录已完成。")).toBeInTheDocument();
  expect(vi.mocked(completeDailyRecord).mock.calls.at(-1)?.[8]).toBe(3);
  if (!saveBeforeCompletion) {
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "保存计划" })); });
    const { savePlan } = await import("@/lib/storage");
    expect(vi.mocked(savePlan).mock.calls.at(-1)?.[5]).toBe(3);
  }
});
