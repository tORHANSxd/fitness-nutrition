import type { User } from "@supabase/supabase-js";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BodyLogView } from "@/components/BodyLogView";
import { deleteBodyLog, loadBodyLogs } from "@/lib/bodyLogs";

vi.mock("@/hooks/useZonedToday", () => ({ useZonedToday: () => "2026-09-22" }));
vi.mock("@/lib/bodyLogs", async (original) => ({
  ...(await original<typeof import("@/lib/bodyLogs")>()),
  loadBodyLogs: vi.fn(),
  saveBodyLog: vi.fn(),
  deleteBodyLog: vi.fn(),
}));
const props = {
  user: { id: "body-safety-test" } as User,
  timeZone: "Asia/Shanghai",
  locale: "zh-CN" as const,
  unitSystem: "metric" as const,
  mode: "record" as const,
};
beforeEach(() => {
  vi.mocked(loadBodyLogs)
    .mockReset()
    .mockResolvedValue([{ logDate: "2026-09-22", weightKg: 72.5 }]);
  vi.mocked(deleteBodyLog).mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

it("distinguishes a failed read from an empty history and blocks overwriting unseen data", async () => {
  vi.mocked(loadBodyLogs).mockRejectedValueOnce(new Error("network failure"));
  render(<BodyLogView {...props} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "身体数据读取失败",
  );
  expect(screen.getByRole("button", { name: "保存记录" })).toBeDisabled();
  expect(screen.queryByText("还没有体测记录。")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存记录" })).toBeEnabled(),
  );
  await waitFor(() => expect(screen.getByLabelText(/^体重/)).toHaveValue("72.5"));
});

it("waits for confirmation before deleting a day's body measurements", async () => {
  render(<BodyLogView {...props} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "删除 2026-09-22 的体测记录" }),
  );
  expect(deleteBodyLog).not.toHaveBeenCalled();
  expect(
    screen.getByRole("dialog", { name: "删除体测记录" }),
  ).toHaveTextContent("2026-09-22");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(deleteBodyLog).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "删除 2026-09-22 的体测记录" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
  await waitFor(() =>
    expect(deleteBodyLog).toHaveBeenCalledExactlyOnceWith(
      "2026-09-22",
      props.user,
    ),
  );
});
