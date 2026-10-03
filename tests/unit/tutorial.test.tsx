import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { TutorialButton, TutorialProvider } from "@/components/Tutorial";
import { loadTutorialPreferences, saveTutorialPreferences } from "@/lib/tutorialStorage";
import { tutorialAction } from "@/lib/tutorial";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/tutorialStorage", () => ({ loadTutorialPreferences: vi.fn(), saveTutorialPreferences: vi.fn() }));
const user = { id: "tutorial-a" } as User;
function app(account = user) { return <TutorialProvider user={account} ready><TutorialButton /><button data-tour="meal-add">真实添加按钮</button></TutorialProvider>; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadTutorialPreferences).mockResolvedValue({ seenVersion: 0, everyVisit: false });
  vi.mocked(saveTutorialPreferences).mockResolvedValue();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("opens once for a new account and remembers explicit dismissal without starting a lesson", async () => {
  render(app());
  expect(await screen.findByRole("dialog", { name: "跟着做一遍" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "暂时跳过" }));
  await waitFor(() => expect(saveTutorialPreferences).toHaveBeenCalledWith(user, { seenVersion: 1 }));
  expect(push).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("does not auto-open after completion but supports replay from the sidebar", async () => {
  vi.mocked(loadTutorialPreferences).mockResolvedValue({ seenVersion: 1, everyVisit: false });
  render(app());
  await act(async () => {});
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "查看教程" }));
  expect(screen.getByRole("dialog", { name: "跟着做一遍" })).toBeInTheDocument();
});
it("shows the tutorial again on each new visit for a test account even after dismissal", async () => {
  vi.mocked(loadTutorialPreferences).mockResolvedValue({ seenVersion: 1, everyVisit: true });
  const first = render(app());
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "暂时跳过" }));
  first.unmount();
  render(app());
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByLabelText("每次进入时显示教程")).toBeChecked();
});
it("a failed state read never counts as a new account and does not write a fallback", async () => {
  vi.mocked(loadTutorialPreferences).mockRejectedValue(new Error("offline"));
  render(app());
  await act(async () => {});
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(saveTutorialPreferences).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "查看教程" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("ignores a previous account's delayed first-visit result", async () => {
  let finish!: (value: { seenVersion: number; everyVisit: boolean }) => void;
  vi.mocked(loadTutorialPreferences).mockImplementation(account => account.id === user.id ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ seenVersion: 1, everyVisit: false }));
  const view = render(app());
  view.rerender(app({ id: "tutorial-b" } as User));
  await act(async () => { finish({ seenVersion: 0, everyVisit: true }); });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("waits for the required real action and ignores unrelated events", async () => {
  render(app());
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: /安排第一餐/ }));
  expect(push).toHaveBeenCalledWith("/today");
  expect(screen.getByRole("button", { name: "继续" })).toBeDisabled();
  act(() => tutorialAction("plan-saved"));
  expect(screen.getByRole("button", { name: "继续" })).toBeDisabled();
  act(() => tutorialAction("food-added"));
  expect(screen.getByRole("button", { name: "继续" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "继续" }));
  expect(screen.getByRole("heading", { name: "填入实际准备的重量" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "继续" })).toBeDisabled();
});
it("reports a failed preference write instead of claiming it was saved", async () => {
  vi.mocked(saveTutorialPreferences).mockRejectedValue(new Error("offline"));
  render(app());
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "暂时跳过" }));
  expect(await screen.findByText("教程状态暂未保存，下次进入时可能再次显示。")).toBeInTheDocument();
});
