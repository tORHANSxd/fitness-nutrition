import type { User } from "@supabase/supabase-js";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrainingLog } from "@/components/TrainingLog";
import { ScheduleCalendar } from "@/components/ScheduleCalendar";
import { loadWorkoutSessions } from "@/lib/trainingStorage";
import { loadPlansInRange } from "@/lib/storage";
import type { WorkoutSession } from "@/lib/types";

vi.mock("@/hooks/useZonedToday", () => ({ useZonedToday: () => "2026-09-22" }));
vi.mock("@/lib/trainingStorage", () => ({
  loadWorkoutSessions: vi.fn(),
  saveWorkoutSession: vi.fn(),
  deleteWorkoutSession: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({ loadPlansInRange: vi.fn() }));

const user = { id: "records-safety-test" } as User;
const props = {
  user,
  onRequireLogin: vi.fn(),
  timeZone: "Asia/Shanghai",
  locale: "zh-CN" as const,
  weekStartsOn: 1,
  unitSystem: "metric" as const,
};
beforeEach(() => {
  vi.mocked(loadWorkoutSessions).mockReset().mockResolvedValue([]);
  vi.mocked(loadPlansInRange).mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

it("requires a decision before an external date change discards an unsaved workout", async () => {
  const view = render(
    <TrainingLog {...props} dateRequest={{ date: "2026-09-22", nonce: 1 }} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "添加训练组" }));
  fireEvent.change(screen.getByLabelText("第1组动作"), {
    target: { value: "未保存的深蹲" },
  });
  view.rerender(
    <TrainingLog {...props} dateRequest={{ date: "2026-09-21", nonce: 2 }} />,
  );
  expect(
    await screen.findByRole("dialog", { name: "当前记录尚未保存" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("训练日期")).toHaveValue("2026-09-22");
  fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
  expect(screen.getByLabelText("第1组动作")).toHaveValue("未保存的深蹲");
  view.rerender(
    <TrainingLog {...props} dateRequest={{ date: "2026-09-20", nonce: 3 }} />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "放弃修改并切换" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("训练日期")).toHaveValue("2026-09-20"),
  );
  await screen.findByRole("button", { name: "添加训练组" });
  expect(screen.queryByLabelText("第1组动作")).not.toBeInTheDocument();
});

it("keeps an unsaved workout when the same signed-in account refreshes", async () => {
  const view = render(<TrainingLog {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "添加训练组" }));
  fireEvent.change(screen.getByLabelText("第1组动作"), {
    target: { value: "正在填写的卧推" },
  });
  view.rerender(<TrainingLog {...props} user={{ ...user }} />);
  expect(await screen.findByLabelText("第1组动作")).toHaveValue(
    "正在填写的卧推",
  );
  expect(loadWorkoutSessions).toHaveBeenCalledTimes(2);
});

it("keeps known calendar records after a failed refresh and allows a retry", async () => {
  const session: WorkoutSession = {
    id: "known",
    status: "recorded",
    sessionDate: "2026-09-22",
    splitLabel: "已保存的上肢训练",
    bodyweightKg: null,
    recovery: null,
    sets: [],
    createdAt: "2026-09-22T01:00:00Z",
  };
  vi.mocked(loadWorkoutSessions).mockResolvedValue([session]);
  render(
    <ScheduleCalendar
      user={user}
      foods={[]}
      onGoTraining={vi.fn()}
      onGoPlanner={vi.fn()}
      timeZone="Asia/Shanghai"
      locale="zh-CN"
      weekStartsOn={1}
      energyUnit="kcal"
    />,
  );
  expect(
    await screen.findByText("已保存的上肢训练 · 0 组"),
  ).toBeInTheDocument();
  vi.mocked(loadPlansInRange).mockRejectedValueOnce(
    new Error("network failure"),
  );
  fireEvent.click(screen.getByRole("button", { name: "上个月" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("日历读取失败");
  expect(screen.getByText("已保存的上肢训练 · 0 组")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(loadPlansInRange).toHaveBeenCalledTimes(3);
});
