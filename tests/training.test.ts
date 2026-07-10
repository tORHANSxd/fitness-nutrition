import { describe, expect, it } from "vitest";
import {
  applyDeloadToDay,
  applyDeloadToTemplate,
  autoEstimate1RM,
  autoregulate,
  bestE1RMByExercise,
  deloadSignals,
  estimate1RM,
  isDeloadWeek,
  loadFromPercent,
  programTemplates,
  rpeFromRir,
  sessionTonnage,
  splitLabels,
  volumeStatus,
  weekStartKey,
  weeklyWorkingSets
} from "@/lib/training";
import type { MuscleGroup, WorkoutSession, WorkoutSet } from "@/lib/types";

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

describe("v2 五分化模板（2026-07-10 计划）", () => {
  const template = programTemplates.fiveDayV2;

  it("周一~周五共 5 天", () => {
    expect(template).toBeDefined();
    expect(template.daysPerWeek).toBe(5);
    expect(template.days).toHaveLength(5);
    const weekdays = ["周一", "周二", "周三", "周四", "周五"];
    template.days.forEach((day, index) => {
      expect(day.dayLabel).toContain(weekdays[index]);
    });
  });

  it("单次动作数为 7/7/7/8/7（对应文档的单次容量上限）", () => {
    expect(template.days.map((day) => day.exercises.length)).toEqual([7, 7, 7, 8, 7]);
  });

  it("周直接组数贴合文档容量地图（胸13/股四14/二头8/三头6/腘绳7/小腿7）", () => {
    const weekly = {} as Record<MuscleGroup, number>;
    for (const day of template.days) {
      for (const exercise of day.exercises) {
        weekly[exercise.muscleGroup] = (weekly[exercise.muscleGroup] ?? 0) + exercise.sets;
      }
    }
    expect(weekly.chest).toBe(13);
    expect(weekly.quads).toBe(14);
    expect(weekly.biceps).toBe(8);
    expect(weekly.triceps).toBe(6);
    expect(weekly.hamstrings).toBe(7);
    expect(weekly.calves).toBe(7);
  });

  it("保留计划标志性的拉长位动作", () => {
    const allExercises = template.days.flatMap((day) => day.exercises.map((item) => item.exercise)).join("/");
    expect(allExercises).toContain("绳索过顶臂屈伸");
    expect(allExercises).toContain("上斜哑铃弯举");
    expect(allExercises).toContain("坐姿腿弯举");
    expect(allExercises).toContain("罗马尼亚硬拉");
  });

  it("旧张老师模板已退役，v2 模板成为列表首位", () => {
    expect(Object.keys(programTemplates)[0]).toBe("fiveDayV2");
    expect(Object.keys(programTemplates)).not.toContain("ppl");
    expect(splitLabels.fiveDayV2).toContain("五分化");
  });
});

describe("减载周（v2 文档：容量减半、留 4–5 RIR、频率动作不变）", () => {
  it("applyDeloadToDay：组数砍约一半(至少1组)、RIR 抬到 4、动作与次数区间不变", () => {
    const day = programTemplates.fiveDayV2.days[0]; // 周一推：卧推 4 组 RIR2 起
    const deload = applyDeloadToDay(day);
    // 组数：4→2、3→2、2→1。
    const sets = day.exercises.map((exercise) => exercise.sets);
    const deloadSets = deload.exercises.map((exercise) => exercise.sets);
    expect(deloadSets).toEqual(sets.map((count) => Math.max(1, Math.round(count / 2))));
    // 努力度：全部留 4 次余力（原 RIR 1/2 → 4）。
    expect(deload.exercises.every((exercise) => exercise.targetRir === 4)).toBe(true);
    // 动作、肌群、次数区间原样保留；splitLabel 标注减载。
    expect(deload.exercises.map((exercise) => exercise.exercise)).toEqual(day.exercises.map((exercise) => exercise.exercise));
    expect(deload.exercises.map((exercise) => exercise.repRange)).toEqual(day.exercises.map((exercise) => exercise.repRange));
    expect(deload.splitLabel).toContain("减载");
    // 原模板不被就地修改。
    expect(day.exercises[0].sets).toBe(4);
  });

  it("applyDeloadToTemplate：五天全部转换、名字标注减载周", () => {
    const deload = applyDeloadToTemplate(programTemplates.fiveDayV2);
    expect(deload.days).toHaveLength(5);
    expect(deload.name).toContain("减载");
    expect(deload.days.every((day) => day.exercises.every((exercise) => exercise.targetRir === 4))).toBe(true);
    // 周总组数砍到约一半：3 组动作四舍五入到 2（"砍约一半"），总量约 60–65%，明显低于正常周。
    const total = (t: typeof deload) => t.days.reduce((sum, day) => sum + day.exercises.reduce((s, e) => s + e.sets, 0), 0);
    expect(total(deload)).toBeLessThanOrEqual(Math.ceil(total(programTemplates.fiveDayV2) * 0.65));
  });

  it("isDeloadWeek：按周起始日判断某日期是否落在减载周", () => {
    const deloadWeeks = ["2026-07-06", "2026-07-20"];
    expect(isDeloadWeek("2026-07-08", deloadWeeks)).toBe(true); // 周三属 07-06 周
    expect(isDeloadWeek("2026-07-12", deloadWeeks)).toBe(true); // 周日仍属 07-06 周
    expect(isDeloadWeek("2026-07-13", deloadWeeks)).toBe(false); // 下周一不属
    expect(isDeloadWeek("2026-07-22", deloadWeeks)).toBe(true);
    expect(isDeloadWeek("2026-07-08", [])).toBe(false);
  });
});
