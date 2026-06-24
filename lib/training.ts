import { round } from "@/lib/nutrition";
import type {
  CarbDayType,
  ExperienceLevel,
  MuscleGroup,
  OneRmFormula,
  ProgramTemplate,
  TrainingSplit,
  VolumeLandmark,
  WorkoutSession,
  WorkoutSet
} from "@/lib/types";

// ---------------------------------------------------------------------------
// 标签
// ---------------------------------------------------------------------------

export const muscleGroupLabels: Record<MuscleGroup, string> = {
  chest: "胸",
  back: "背",
  quads: "股四头",
  hamstrings: "腘绳肌",
  glutes: "臀",
  shoulders: "肩",
  biceps: "肱二头",
  triceps: "肱三头",
  calves: "小腿",
  abs: "核心"
};

export const muscleGroupOrder: MuscleGroup[] = [
  "chest",
  "back",
  "quads",
  "hamstrings",
  "glutes",
  "shoulders",
  "biceps",
  "triceps",
  "calves",
  "abs"
];

export const carbDayLabelsForTraining: Record<CarbDayType, string> = {
  high: "高碳",
  mid: "中碳",
  low: "低碳"
};

export const splitLabels: Record<TrainingSplit, string> = {
  ppl: "推/拉/腿 5天",
  pplLumbarSafe: "推/拉/腿 5天（腰突）",
  upperLower: "上下分化 4天",
  fullBody: "全身 3天"
};

// ---------------------------------------------------------------------------
// 训练量地标（每肌群每周「硬组数」working sets），按训练经验区分。
// 数值参考 Renaissance Periodization 训练量地标与 Schoenfeld 剂量反应 meta 分析。
// 单位：组/周。MV 维持量、MEV 最小有效量、MAV 最大适应量(取区间上限)、MRV 最大可恢复量。
// ---------------------------------------------------------------------------

export const volumeLandmarks: Record<ExperienceLevel, Record<MuscleGroup, VolumeLandmark>> = {
  beginner: {
    chest: { mv: 6, mev: 8, mav: 14, mrv: 18 },
    back: { mv: 6, mev: 8, mav: 14, mrv: 20 },
    quads: { mv: 6, mev: 8, mav: 14, mrv: 18 },
    hamstrings: { mv: 4, mev: 6, mav: 12, mrv: 16 },
    glutes: { mv: 0, mev: 4, mav: 10, mrv: 16 },
    shoulders: { mv: 6, mev: 8, mav: 16, mrv: 22 },
    biceps: { mv: 4, mev: 6, mav: 12, mrv: 18 },
    triceps: { mv: 4, mev: 6, mav: 10, mrv: 16 },
    calves: { mv: 6, mev: 8, mav: 12, mrv: 18 },
    abs: { mv: 0, mev: 6, mav: 12, mrv: 20 }
  },
  intermediate: {
    chest: { mv: 8, mev: 10, mav: 16, mrv: 22 },
    back: { mv: 8, mev: 10, mav: 18, mrv: 25 },
    quads: { mv: 8, mev: 10, mav: 16, mrv: 20 },
    hamstrings: { mv: 6, mev: 8, mav: 13, mrv: 18 },
    glutes: { mv: 0, mev: 6, mav: 12, mrv: 18 },
    shoulders: { mv: 8, mev: 10, mav: 18, mrv: 26 },
    biceps: { mv: 6, mev: 8, mav: 14, mrv: 20 },
    triceps: { mv: 6, mev: 8, mav: 12, mrv: 18 },
    calves: { mv: 8, mev: 10, mav: 14, mrv: 20 },
    abs: { mv: 0, mev: 6, mav: 14, mrv: 25 }
  },
  advanced: {
    chest: { mv: 10, mev: 12, mav: 18, mrv: 24 },
    back: { mv: 10, mev: 12, mav: 20, mrv: 27 },
    quads: { mv: 8, mev: 12, mav: 18, mrv: 22 },
    hamstrings: { mv: 6, mev: 10, mav: 14, mrv: 20 },
    glutes: { mv: 0, mev: 8, mav: 14, mrv: 20 },
    shoulders: { mv: 10, mev: 12, mav: 20, mrv: 28 },
    biceps: { mv: 6, mev: 10, mav: 16, mrv: 22 },
    triceps: { mv: 6, mev: 10, mav: 14, mrv: 20 },
    calves: { mv: 8, mev: 12, mav: 16, mrv: 22 },
    abs: { mv: 0, mev: 8, mav: 16, mrv: 25 }
  }
};

// %1RM ↔ 次数 ↔ 目标（NSCA 负荷表）。
export const intensityZones: Array<{ goal: string; pctMin: number; pctMax: number; repMin: number; repMax: number }> = [
  { goal: "最大力量", pctMin: 85, pctMax: 100, repMin: 1, repMax: 5 },
  { goal: "肌肥大", pctMin: 67, pctMax: 85, repMin: 6, repMax: 12 },
  { goal: "力量耐力", pctMin: 0, pctMax: 67, repMin: 15, repMax: 30 }
];

// 周期内 RIR 目标（接近力竭程度）。证据：1–3 RIR 与力竭在容量相等时肥大几乎无差异。
export const rirTargetByWeek = [4, 3, 3, 2, 2, 1] as const;

// ---------------------------------------------------------------------------
// 纯计算函数
// ---------------------------------------------------------------------------

/** 估算 1RM。Epley 适合 ≤5 次，Brzycki 适合 6–10 次；>10 次误差大，仅供参考。 */
export function estimate1RM(weightKg: number, reps: number, formula: OneRmFormula = "epley"): number {
  if (weightKg <= 0 || reps <= 0) {
    return 0;
  }
  if (reps === 1) {
    return round(weightKg, 1);
  }
  if (formula === "brzycki") {
    if (reps >= 37) {
      return 0;
    }
    return round((weightKg * 36) / (37 - reps), 1);
  }
  return round(weightKg * (1 + reps / 30), 1);
}

/** 根据次数自动选公式：≤5 用 Epley，否则 Brzycki。 */
export function autoEstimate1RM(weightKg: number, reps: number): number {
  return estimate1RM(weightKg, reps, reps <= 5 ? "epley" : "brzycki");
}

/** 由目标 1RM 与百分比反推训练重量（四舍五入到 0.5kg 档）。 */
export function loadFromPercent(oneRm: number, pct: number): number {
  if (oneRm <= 0) {
    return 0;
  }
  return round(Math.round((oneRm * pct) / 100 / 0.5) * 0.5, 1);
}

export function rpeFromRir(rir: number): number {
  return Math.max(0, Math.min(10, 10 - rir));
}

/** 单组容量（重量×次数）。热身组不计。 */
export function setTonnage(set: WorkoutSet): number {
  if (set.isWarmup) {
    return 0;
  }
  return round(set.weightKg * set.reps, 1);
}

export function sessionTonnage(session: WorkoutSession): number {
  return round(
    session.sets.reduce((sum, set) => sum + setTonnage(set), 0),
    1
  );
}

/** 一次训练中每个动作的最佳估算 1RM（取各有效组的最大值）。 */
export function bestE1RMByExercise(session: WorkoutSession): Array<{ exercise: string; e1rm: number }> {
  const best = new Map<string, number>();
  for (const set of session.sets) {
    if (set.isWarmup) {
      continue;
    }
    const e1rm = autoEstimate1RM(set.weightKg, set.reps);
    best.set(set.exercise, Math.max(best.get(set.exercise) ?? 0, e1rm));
  }
  return Array.from(best.entries())
    .map(([exercise, e1rm]) => ({ exercise, e1rm }))
    .sort((a, b) => b.e1rm - a.e1rm);
}

/** ISO 周一为一周起点，返回 YYYY-MM-DD。 */
export function weekStartKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  const day = (date.getDay() + 6) % 7; // 周一=0
  date.setDate(date.getDate() - day);
  return toDateKey(date);
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 统计某一周（含 weekStart 起 7 天）每肌群的有效硬组数。 */
export function weeklyWorkingSets(sessions: WorkoutSession[], weekStart: string): Record<MuscleGroup, number> {
  const counts = Object.fromEntries(muscleGroupOrder.map((m) => [m, 0])) as Record<MuscleGroup, number>;
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  for (const session of sessions) {
    const date = new Date(`${session.sessionDate}T00:00:00`);
    if (date < start || date >= end) {
      continue;
    }
    for (const set of session.sets) {
      if (!set.isWarmup) {
        counts[set.muscleGroup] += 1;
      }
    }
  }
  return counts;
}

export type VolumeStatus = "under" | "optimal" | "near-max" | "over";

/** 把当周组数与地标对比，返回状态（用于进度条配色/提示）。 */
export function volumeStatus(sets: number, landmark: VolumeLandmark): VolumeStatus {
  if (sets < landmark.mev) {
    return "under";
  }
  if (sets > landmark.mrv) {
    return "over";
  }
  if (sets >= landmark.mav) {
    return "near-max";
  }
  return "optimal";
}

export const volumeStatusLabels: Record<VolumeStatus, string> = {
  under: "低于 MEV，可加量",
  optimal: "适应区(MEV–MAV)",
  "near-max": "接近 MRV",
  over: "超出 MRV，建议减载"
};

/** RIR 自动调节：对比目标 RIR 与实际完成时的 RIR，给出下次负荷/组数建议。 */
export function autoregulate(
  targetRir: number,
  actualRir: number
): { loadPct: number; note: string } {
  const diff = actualRir - targetRir; // 正=太轻，负=太重
  if (diff >= 2) {
    return { loadPct: 5, note: "过轻：下次加重约 5%" };
  }
  if (diff === 1) {
    return { loadPct: 2.5, note: "略轻：加一小档(约 2.5%)" };
  }
  if (diff === 0) {
    return { loadPct: 0, note: "正合适：维持负荷，先把次数做满（双重渐进）" };
  }
  if (diff === -1) {
    return { loadPct: 0, note: "偏重：保持负荷，把次数补满再加重" };
  }
  return { loadPct: -5, note: "过重：下次减重约 5% 或减 1 组" };
}

/** 减载触发：任意 2 条满足即建议安排 1 周 deload。 */
export function deloadSignals(input: {
  e1rmDeclined: boolean;
  overReachingVolume: boolean;
  lowRecovery: boolean;
  weeksTrained: number;
}): { triggered: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.e1rmDeclined) {
    reasons.push("关键动作 E1RM 连续下降");
  }
  if (input.overReachingVolume) {
    reasons.push("已有肌群超出 MRV");
  }
  if (input.lowRecovery) {
    reasons.push("主观恢复评分偏低");
  }
  if (input.weeksTrained >= 6) {
    reasons.push(`已连续训练 ${input.weeksTrained} 周`);
  }
  return { triggered: reasons.length >= 2, reasons };
}

// ---------------------------------------------------------------------------
// 方案模板（功能性复合打底 + 孤立补容量）
// ---------------------------------------------------------------------------

export const programTemplates: Record<TrainingSplit, ProgramTemplate> = {
  ppl: {
    id: "ppl",
    name: "推/拉/腿 5天（贴合 5练1高碳）",
    summary: "容量上限高，腿日为唯一高碳日，正好对应「5练1高碳」碳循环。",
    daysPerWeek: 5,
    days: [
      {
        dayLabel: "D1 推",
        splitLabel: "推 Push",
        muscleGroups: ["chest", "shoulders", "triceps"],
        carbDay: "mid",
        exercises: [
          { exercise: "卧推", muscleGroup: "chest", sets: 4, repRange: [5, 8], targetRir: 2 },
          { exercise: "上斜哑铃推", muscleGroup: "chest", sets: 3, repRange: [8, 12], targetRir: 2 },
          { exercise: "坐姿推举", muscleGroup: "shoulders", sets: 3, repRange: [6, 10], targetRir: 2 },
          { exercise: "侧平举", muscleGroup: "shoulders", sets: 3, repRange: [12, 20], targetRir: 1 },
          { exercise: "绳索下压", muscleGroup: "triceps", sets: 3, repRange: [10, 15], targetRir: 1 }
        ]
      },
      {
        dayLabel: "D2 拉",
        splitLabel: "拉 Pull",
        muscleGroups: ["back", "biceps"],
        carbDay: "mid",
        exercises: [
          { exercise: "引体/高位下拉", muscleGroup: "back", sets: 4, repRange: [6, 10], targetRir: 2 },
          { exercise: "杠铃划船", muscleGroup: "back", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "面拉", muscleGroup: "shoulders", sets: 3, repRange: [12, 20], targetRir: 1 },
          { exercise: "弯举", muscleGroup: "biceps", sets: 4, repRange: [8, 12], targetRir: 1 }
        ]
      },
      {
        dayLabel: "D3 腿",
        splitLabel: "腿 Legs",
        muscleGroups: ["quads", "hamstrings", "glutes", "calves"],
        carbDay: "high",
        exercises: [
          { exercise: "深蹲", muscleGroup: "quads", sets: 4, repRange: [5, 8], targetRir: 2 },
          { exercise: "罗马尼亚硬拉", muscleGroup: "hamstrings", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "腿举", muscleGroup: "quads", sets: 3, repRange: [10, 15], targetRir: 1 },
          { exercise: "臀推", muscleGroup: "glutes", sets: 3, repRange: [8, 12], targetRir: 2 },
          { exercise: "提踵", muscleGroup: "calves", sets: 4, repRange: [10, 15], targetRir: 1 }
        ]
      },
      {
        dayLabel: "D4 推",
        splitLabel: "推 Push(肥大)",
        muscleGroups: ["chest", "shoulders", "triceps"],
        carbDay: "mid",
        exercises: [
          { exercise: "上斜杠铃推", muscleGroup: "chest", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "夹胸/飞鸟", muscleGroup: "chest", sets: 3, repRange: [12, 15], targetRir: 1 },
          { exercise: "侧平举", muscleGroup: "shoulders", sets: 4, repRange: [12, 20], targetRir: 1 },
          { exercise: "过顶臂屈伸", muscleGroup: "triceps", sets: 3, repRange: [10, 15], targetRir: 1 }
        ]
      },
      {
        dayLabel: "D5 拉",
        splitLabel: "拉 Pull(肥大)",
        muscleGroups: ["back", "biceps"],
        carbDay: "low",
        exercises: [
          { exercise: "坐姿划船", muscleGroup: "back", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "直臂下拉", muscleGroup: "back", sets: 3, repRange: [12, 15], targetRir: 1 },
          { exercise: "锤式弯举", muscleGroup: "biceps", sets: 3, repRange: [10, 15], targetRir: 1 },
          { exercise: "核心循环", muscleGroup: "abs", sets: 3, repRange: [12, 20], targetRir: 1 }
        ]
      }
    ]
  },
  pplLumbarSafe: {
    id: "pplLumbarSafe",
    name: "推/拉/腿 5天（腰突·脊柱友好）",
    summary:
      "腰椎间盘突出适配版：与 5练1高碳 同样的推/拉/腿结构，但全程改器械与支撑动作，去除硬拉/杠铃深蹲/俯身杠铃划船/站姿过顶推举等脊柱剪切与轴向压缩；腿日用腿举(腰背贴垫)+坐姿腿弯举替代硬拉深蹲，划船改胸部支撑，核心用麦吉尔三件套替代负重屈曲。全程保持中立脊柱、避免负重弯腰/旋转。注意：急性期请遵医嘱，疼痛/放射痛加重立即停止。",
    daysPerWeek: 5,
    days: [
      {
        dayLabel: "D1 推",
        splitLabel: "推 Push(支撑)",
        muscleGroups: ["chest", "shoulders", "triceps"],
        carbDay: "mid",
        exercises: [
          { exercise: "器械胸推(坐姿靠背)", muscleGroup: "chest", sets: 4, repRange: [6, 10], targetRir: 2 },
          { exercise: "上斜哑铃卧推", muscleGroup: "chest", sets: 3, repRange: [8, 12], targetRir: 2 },
          { exercise: "坐姿器械肩推(靠背支撑)", muscleGroup: "shoulders", sets: 3, repRange: [8, 12], targetRir: 2 },
          { exercise: "侧平举", muscleGroup: "shoulders", sets: 3, repRange: [12, 20], targetRir: 1 },
          { exercise: "绳索下压", muscleGroup: "triceps", sets: 3, repRange: [10, 15], targetRir: 1 }
        ]
      },
      {
        dayLabel: "D2 拉",
        splitLabel: "拉 Pull(去腰椎剪切)",
        muscleGroups: ["back", "biceps"],
        carbDay: "mid",
        exercises: [
          { exercise: "高位下拉/辅助引体", muscleGroup: "back", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "胸部支撑器械划船", muscleGroup: "back", sets: 4, repRange: [10, 12], targetRir: 2 },
          { exercise: "面拉", muscleGroup: "shoulders", sets: 3, repRange: [15, 20], targetRir: 1 },
          { exercise: "坐姿绳索弯举", muscleGroup: "biceps", sets: 4, repRange: [10, 15], targetRir: 1 }
        ]
      },
      {
        dayLabel: "D3 腿",
        splitLabel: "腿 Legs(无轴向压缩)",
        muscleGroups: ["quads", "hamstrings", "glutes", "calves"],
        carbDay: "high",
        exercises: [
          { exercise: "腿举(腰背贴垫·控制ROM)", muscleGroup: "quads", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "哈克深蹲/器械深蹲", muscleGroup: "quads", sets: 3, repRange: [10, 15], targetRir: 2 },
          { exercise: "坐姿腿弯举(替代罗马尼亚硬拉)", muscleGroup: "hamstrings", sets: 4, repRange: [10, 15], targetRir: 1 },
          { exercise: "器械臀推(中立脊柱)", muscleGroup: "glutes", sets: 3, repRange: [10, 15], targetRir: 2 },
          { exercise: "坐姿提踵", muscleGroup: "calves", sets: 4, repRange: [12, 15], targetRir: 1 }
        ]
      },
      {
        dayLabel: "D4 推",
        splitLabel: "推 Push(肥大·支撑)",
        muscleGroups: ["chest", "shoulders", "triceps"],
        carbDay: "mid",
        exercises: [
          { exercise: "上斜器械推胸", muscleGroup: "chest", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "蝴蝶机夹胸", muscleGroup: "chest", sets: 3, repRange: [12, 15], targetRir: 1 },
          { exercise: "侧平举", muscleGroup: "shoulders", sets: 4, repRange: [12, 20], targetRir: 1 },
          { exercise: "坐姿绳索过顶臂屈伸", muscleGroup: "triceps", sets: 3, repRange: [10, 15], targetRir: 1 }
        ]
      },
      {
        dayLabel: "D5 拉",
        splitLabel: "拉 Pull(肥大)+核心",
        muscleGroups: ["back", "biceps", "abs"],
        carbDay: "low",
        exercises: [
          { exercise: "坐姿绳索划船(中立脊柱·不晃腰)", muscleGroup: "back", sets: 4, repRange: [10, 12], targetRir: 2 },
          { exercise: "直臂下拉", muscleGroup: "back", sets: 3, repRange: [12, 15], targetRir: 1 },
          { exercise: "锤式弯举", muscleGroup: "biceps", sets: 3, repRange: [10, 15], targetRir: 1 },
          { exercise: "麦吉尔核心三件套(鸟狗/侧桥/卷腹)", muscleGroup: "abs", sets: 3, repRange: [10, 15], targetRir: 1 }
        ]
      }
    ]
  },
  upperLower: {
    id: "upperLower",
    name: "上下分化 4天",
    summary: "每肌群每周练 2 次，恢复与容量平衡，文献支持度最高。",
    daysPerWeek: 4,
    days: [
      {
        dayLabel: "D1 下肢(力量)",
        splitLabel: "下肢 Lower",
        muscleGroups: ["quads", "hamstrings", "glutes"],
        carbDay: "high",
        exercises: [
          { exercise: "深蹲", muscleGroup: "quads", sets: 5, repRange: [4, 6], targetRir: 2 },
          { exercise: "罗马尼亚硬拉", muscleGroup: "hamstrings", sets: 4, repRange: [6, 10], targetRir: 2 },
          { exercise: "保加利亚分腿蹲", muscleGroup: "glutes", sets: 3, repRange: [8, 12], targetRir: 2 }
        ]
      },
      {
        dayLabel: "D2 上肢(力量)",
        splitLabel: "上肢 Upper",
        muscleGroups: ["chest", "back", "shoulders"],
        carbDay: "mid",
        exercises: [
          { exercise: "卧推", muscleGroup: "chest", sets: 5, repRange: [4, 6], targetRir: 2 },
          { exercise: "引体", muscleGroup: "back", sets: 4, repRange: [6, 10], targetRir: 2 },
          { exercise: "坐姿推举", muscleGroup: "shoulders", sets: 3, repRange: [6, 10], targetRir: 2 }
        ]
      },
      {
        dayLabel: "D4 下肢(肥大)",
        splitLabel: "下肢 Lower",
        muscleGroups: ["quads", "glutes", "hamstrings", "calves"],
        carbDay: "high",
        exercises: [
          { exercise: "腿举", muscleGroup: "quads", sets: 4, repRange: [10, 15], targetRir: 1 },
          { exercise: "臀推", muscleGroup: "glutes", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "腿弯举", muscleGroup: "hamstrings", sets: 3, repRange: [10, 15], targetRir: 1 },
          { exercise: "提踵", muscleGroup: "calves", sets: 4, repRange: [10, 15], targetRir: 1 }
        ]
      },
      {
        dayLabel: "D5 上肢(肥大)",
        splitLabel: "上肢 Upper",
        muscleGroups: ["chest", "back", "shoulders", "biceps", "triceps"],
        carbDay: "mid",
        exercises: [
          { exercise: "上斜哑铃推", muscleGroup: "chest", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "坐姿划船", muscleGroup: "back", sets: 4, repRange: [8, 12], targetRir: 2 },
          { exercise: "侧平举", muscleGroup: "shoulders", sets: 4, repRange: [12, 20], targetRir: 1 },
          { exercise: "弯举 + 臂屈伸", muscleGroup: "biceps", sets: 3, repRange: [10, 15], targetRir: 1 }
        ]
      }
    ]
  },
  fullBody: {
    id: "fullBody",
    name: "全身 3天",
    summary: "新手/时间紧首选，功能性最强，每肌群每周练 3 次。",
    daysPerWeek: 3,
    days: [
      {
        dayLabel: "D1 全身",
        splitLabel: "全身 A",
        muscleGroups: ["quads", "chest", "back"],
        carbDay: "high",
        exercises: [
          { exercise: "深蹲", muscleGroup: "quads", sets: 3, repRange: [6, 10], targetRir: 2 },
          { exercise: "卧推", muscleGroup: "chest", sets: 3, repRange: [6, 10], targetRir: 2 },
          { exercise: "划船", muscleGroup: "back", sets: 3, repRange: [8, 12], targetRir: 2 }
        ]
      },
      {
        dayLabel: "D3 全身",
        splitLabel: "全身 B",
        muscleGroups: ["hamstrings", "shoulders", "back"],
        carbDay: "mid",
        exercises: [
          { exercise: "硬拉", muscleGroup: "hamstrings", sets: 3, repRange: [4, 6], targetRir: 2 },
          { exercise: "坐姿推举", muscleGroup: "shoulders", sets: 3, repRange: [6, 10], targetRir: 2 },
          { exercise: "引体/下拉", muscleGroup: "back", sets: 3, repRange: [8, 12], targetRir: 2 }
        ]
      },
      {
        dayLabel: "D5 全身",
        splitLabel: "全身 C",
        muscleGroups: ["quads", "chest", "glutes"],
        carbDay: "mid",
        exercises: [
          { exercise: "前蹲", muscleGroup: "quads", sets: 3, repRange: [6, 10], targetRir: 2 },
          { exercise: "上斜卧推", muscleGroup: "chest", sets: 3, repRange: [8, 12], targetRir: 2 },
          { exercise: "臀推 + 农夫行走", muscleGroup: "glutes", sets: 3, repRange: [8, 12], targetRir: 2 }
        ]
      }
    ]
  }
};
