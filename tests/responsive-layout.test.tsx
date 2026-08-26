import type { User } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MacroBars } from "@/components/MacroBars";
import { TrainingLog } from "@/components/TrainingLog";
import { createStarterMeals, defaultProfile } from "@/lib/demoState";
import { builtinFoods } from "@/lib/foods";
import { buildNutritionResult } from "@/lib/nutrition";

vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null
}));

vi.mock("@/components/useDeloadWeeks", () => ({
  useDeloadWeeks: () => ({ deloadWeeks: [], toggleDeloadWeek: vi.fn() })
}));

vi.mock("@/lib/trainingStorage", async () => {
  class TrainingAuthError extends Error {}
  return {
    TrainingAuthError,
    deleteWorkoutSession: vi.fn(),
    loadWorkoutSessions: vi.fn().mockResolvedValue([]),
    saveWorkoutSession: vi.fn()
  };
});

afterEach(cleanup);

describe("无横向滚动的响应式布局", () => {
  it("uses compact fixed tables for both macro summaries", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })
    });
    const meals = createStarterMeals(defaultProfile);
    const result = buildNutritionResult(defaultProfile, meals, builtinFoods);

    render(<MacroBars result={result} meals={meals} />);

    const summaryGrid = screen.getByRole("heading", { name: "当天摄入对比" }).closest("section")!.parentElement!;
    expect(summaryGrid).not.toHaveClass("xl:grid-cols-2");
    for (const container of screen.getAllByTestId("macro-table-container")) {
      expect(container).not.toHaveClass("overflow-x-auto");
    }
    for (const table of screen.getAllByRole("table")) {
      expect(table).toHaveClass("table-fixed");
      expect(table).not.toHaveClass("min-w-[420px]");
    }
  });

  it("spreads the five-day training template across the desktop row", () => {
    render(
      <TrainingLog
        user={{ id: "visual-test-user" } as User}
        onRequireLogin={vi.fn()}
        timeZone="Asia/Shanghai"
        locale="zh-CN"
        weekStartsOn={1}
        unitSystem="metric"
      />
    );

    const templateGrid = screen.getByTestId("training-template-days");
    expect(templateGrid).toHaveClass("grid", "lg:grid-cols-5");
    expect(templateGrid).not.toHaveClass("overflow-x-auto");
    expect(templateGrid.children).toHaveLength(5);
    for (const card of Array.from(templateGrid.children)) {
      expect(card).not.toHaveClass("min-w-[120px]", "shrink-0");
    }
  });
});
