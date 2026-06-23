import { describe, expect, it } from "vitest";
import {
  autoEstimate1RM,
  autoregulate,
  bestE1RMByExercise,
  deloadSignals,
  estimate1RM,
  loadFromPercent,
  rpeFromRir,
  sessionTonnage,
  volumeStatus,
  weekStartKey,
  weeklyWorkingSets
} from "@/lib/training";
import type { WorkoutSession, WorkoutSet } from "@/lib/types";

function makeSet(partial: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    exercise: partial.exercise ?? "深蹲",
    muscleGroup: partial.muscleGroup ?? "quads",
    weightKg: partial.weightKg ?? 100,
    reps: partial.reps ?? 5,
    rir: partial.rir ?? 2,
    isWarmup: partial.isWarmup ?? false
  };
}

function makeSession(date: string, sets: WorkoutSet[]): WorkoutSession {
  return {
    id: `s-${date}`,
    sessionDate: date,
    splitLabel: "腿 Legs",
    carbDayType: "high",
    sets,
    createdAt: `${date}T00:00:00.000Z`
  };
}

describe("estimate1RM", () => {
  it("Epley: 100kg×5 ≈ 116.7", () => {
    expect(estimate1RM(100, 5, "epley")).toBe(116.7);
  });

  it("Brzycki: 100kg×5 = 112.5", () => {
    expect(estimate1RM(100, 5, "brzycki")).toBe(112.5);
  });

  it("1 次直接返回原重量", () => {
    expect(estimate1RM(120, 1)).toBe(120);
  });

  it("非法输入返回 0", () => {
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(100, 0)).toBe(0);
  });

  it("autoEstimate 按次数选公式：≤5 用 Epley，>5 用 Brzycki", () => {
    expect(autoEstimate1RM(100, 5)).toBe(estimate1RM(100, 5, "epley"));
    expect(autoEstimate1RM(100, 8)).toBe(estimate1RM(100, 8, "brzycki"));
  });
});

describe("loadFromPercent", () => {
  it("按 %1RM 反推并取 0.5kg 档", () => {
    expect(loadFromPercent(116.7, 80)).toBe(93.5);
  });
});

describe("rpeFromRir", () => {
  it("RPE = 10 − RIR，并夹在 0–10", () => {
    expect(rpeFromRir(2)).toBe(8);
    expect(rpeFromRir(0)).toBe(10);
    expect(rpeFromRir(15)).toBe(0);
  });
});

describe("tonnage", () => {
  it("热身组不计入容量", () => {
    const session = makeSession("2026-06-15", [
      makeSet({ weightKg: 60, reps: 5, isWarmup: true }),
      makeSet({ weightKg: 100, reps: 5 }),
      makeSet({ weightKg: 100, reps: 5 })
    ]);
    expect(sessionTonnage(session)).toBe(1000);
  });
});

describe("bestE1RMByExercise", () => {
  it("取每个动作各有效组的最大估算 1RM", () => {
    const session = makeSession("2026-06-15", [
      makeSet({ exercise: "卧推", muscleGroup: "chest", weightKg: 80, reps: 5 }),
      makeSet({ exercise: "卧推", muscleGroup: "chest", weightKg: 85, reps: 3 })
    ]);
    const result = bestE1RMByExercise(session);
    expect(result[0].exercise).toBe("卧推");
    expect(result[0].e1rm).toBe(estimate1RM(85, 3, "epley"));
  });
});

describe("weeklyWorkingSets & weekStartKey", () => {
  it("周一为一周起点", () => {
    // 2026-06-17 是周三 → 周起点应为 2026-06-15(周一)
    expect(weekStartKey("2026-06-17")).toBe("2026-06-15");
  });

  it("仅统计当周、且不含热身组", () => {
    const sessions = [
      makeSession("2026-06-15", [makeSet({ muscleGroup: "quads" }), makeSet({ muscleGroup: "quads", isWarmup: true })]),
      makeSession("2026-06-17", [makeSet({ muscleGroup: "quads" }), makeSet({ muscleGroup: "hamstrings" })]),
      makeSession("2026-06-23", [makeSet({ muscleGroup: "quads" })]) // 下一周，不计
    ];
    const counts = weeklyWorkingSets(sessions, "2026-06-15");
    expect(counts.quads).toBe(2);
    expect(counts.hamstrings).toBe(1);
  });
});

describe("volumeStatus", () => {
  const lm = { mv: 8, mev: 10, mav: 16, mrv: 22 };
  it("分级正确", () => {
    expect(volumeStatus(6, lm)).toBe("under");
    expect(volumeStatus(12, lm)).toBe("optimal");
    expect(volumeStatus(18, lm)).toBe("near-max");
    expect(volumeStatus(24, lm)).toBe("over");
  });
});

describe("autoregulate", () => {
  it("太轻加重，正好维持，太重减重", () => {
    expect(autoregulate(2, 4).loadPct).toBe(5);
    expect(autoregulate(2, 3).loadPct).toBe(2.5);
    expect(autoregulate(2, 2).loadPct).toBe(0);
    expect(autoregulate(2, 1).loadPct).toBe(0);
    expect(autoregulate(2, 0).loadPct).toBe(-5);
  });
});

describe("deloadSignals", () => {
  it("任意两条满足即触发", () => {
    expect(
      deloadSignals({ e1rmDeclined: true, overReachingVolume: true, lowRecovery: false, weeksTrained: 3 }).triggered
    ).toBe(true);
    expect(
      deloadSignals({ e1rmDeclined: true, overReachingVolume: false, lowRecovery: false, weeksTrained: 3 }).triggered
    ).toBe(false);
  });
});
