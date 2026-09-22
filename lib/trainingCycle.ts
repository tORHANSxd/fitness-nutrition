import { addDays, daysBetween, isDateKey } from "@/lib/dateTime";
import type { PlanProtocol, ProgramDay, ProgramExercise, ProgramTemplate, WorkoutSchedule, WorkoutSession, WorkoutSet } from "@/lib/types";

function exercise(exerciseId: string, name: string, muscleGroup: ProgramExercise["muscleGroup"], sets: number, repRange: [number, number], loadType: WorkoutSet["loadType"] = "external", rpt = false): ProgramExercise {
  return { exerciseId, exercise: name, muscleGroup, sets, repRange, targetRir: 2, loadType,
    prescription: Array.from({ length: sets }, (_, i) => ({ kind: rpt ? "rpt" : muscleGroup === "abs" ? "core" : "straight", targetRir: 2, ...(muscleGroup !== "abs" ? { repRange: rpt ? ([[5, 7], [6, 9], [7, 10]] as [number, number][])[i] : repRange } : {}) })) };
}

const recoveryDays: ProgramDay[] = [
  { dayLabel: "D1 胸三头", splitLabel: "胸三头·恢复", muscleGroups: ["chest", "triceps"], exercises: [
    exercise("barbell-bench", "杠铃卧推", "chest", 3, [5, 7], "external", true), exercise("incline-db-bench", "上斜哑铃卧推", "chest", 2, [8, 10]), exercise("dips", "双杠臂屈伸", "chest", 2, [8, 10], "bodyweight"), exercise("cable-fly", "绳索夹胸", "chest", 2, [8, 10]), exercise("overhead-extension", "过顶臂屈伸", "triceps", 2, [10, 12]),
  ] },
  { dayLabel: "D3 背二头", splitLabel: "背二头·恢复", muscleGroups: ["back", "biceps"], exercises: [
    exercise("pull-up", "引体向上", "back", 3, [5, 7], "bodyweight", true), exercise("chest-supported-row", "胸支撑划船", "back", 2, [8, 12]), exercise("narrow-cable-row", "窄握绳索划船", "back", 2, [8, 12]), exercise("supinated-pulldown", "反手下拉", "back", 2, [8, 12]), exercise("incline-curl", "上斜弯举", "biceps", 2, [8, 12]),
  ] },
  { dayLabel: "D5 肩手臂", splitLabel: "肩手臂·恢复", muscleGroups: ["shoulders", "triceps", "biceps"], exercises: [
    exercise("smith-press", "史密斯实力推", "shoulders", 3, [5, 7], "external", true), exercise("single-cable-lateral", "单臂绳索侧平举", "shoulders", 3, [12, 15]), exercise("reverse-fly", "反向飞鸟", "shoulders", 3, [15, 20]), exercise("overhead-extension", "过顶臂屈伸", "triceps", 2, [10, 12]), exercise("incline-curl", "上斜弯举", "biceps", 2, [8, 12]),
  ] },
  { dayLabel: "D7 腿核心", splitLabel: "腿核心·恢复", muscleGroups: ["quads", "hamstrings", "glutes", "calves", "abs"], exercises: [
    exercise("high-bar-squat", "高杠深蹲", "quads", 3, [5, 7], "external", true), exercise("leg-press", "腿举", "quads", 2, [10, 15]), exercise("seated-leg-curl", "坐姿腿弯举", "hamstrings", 2, [10, 15]), exercise("hip-thrust", "髋冲", "glutes", 2, [8, 12]), exercise("leg-extension", "腿屈伸", "quads", 2, [12, 15]), exercise("calf-raise", "提踵（无痛时）", "calves", 2, [12, 15]), exercise("dead-bug", "死虫", "abs", 2, [0, 0], "bodyweight"), exercise("side-plank", "侧桥", "abs", 2, [0, 0], "timed"),
  ] },
];

export const rptRecoveryTemplate: ProgramTemplate = { id: "rptAlternate8DayV4", name: "8天交替倒金字塔·恢复循环", summary: "胸/休/背/休/肩手臂/休/腿核心/休；一个恢复循环后人工复盘，不自动增加容量。", daysPerWeek: 3.5, phase: "recovery", days: recoveryDays };

export const exerciseSubstitutions: {id:string;name:string;loadType:WorkoutSet["loadType"]}[][] = [
  [{id:"pull-up",name:"引体向上",loadType:"bodyweight"},{id:"assisted-pull-up",name:"助力引体",loadType:"assisted"},{id:"lat-pulldown",name:"高位下拉",loadType:"external"}],
  [{id:"chest-supported-row",name:"胸支撑划船",loadType:"external"},{id:"barbell-row",name:"杠铃划船",loadType:"external"}],
  [{id:"reverse-fly",name:"反向飞鸟",loadType:"external"},{id:"face-pull",name:"绳索面拉",loadType:"external"}],
  [{id:"incline-curl",name:"上斜弯举",loadType:"external"},{id:"hammer-curl",name:"锤式弯举",loadType:"external"}],
  [{id:"overhead-extension",name:"过顶臂屈伸",loadType:"external"},{id:"triceps-pushdown",name:"绳索下压",loadType:"external"}],
];

export function cycleDay(protocol: PlanProtocol, date: string): { index: number; cycle: number; prescription: ProgramDay | null; reviewDue: boolean } | null {
  if (!isDateKey(date)) throw new Error("训练日期无效。");
  const diff = daysBetween(protocol.trainingCycle.anchorDate, date);
  if (diff < 0 || date < protocol.effectiveFrom) return null;
  const index = diff % 8;
  return { index, cycle: Math.floor(diff / 8) + 1, prescription: index % 2 === 0 ? structuredClone(recoveryDays[index / 2]) : null, reviewDue: diff >= 8 };
}

export function previewCycle(protocol: PlanProtocol, from: string, days: number, existing: WorkoutSchedule[], sessions: WorkoutSession[]): WorkoutSchedule[] {
  if (!Number.isInteger(days) || days < 1 || days > 64) throw new Error("一次预览 1—64 天。");
  const occupied = new Set([...existing.map((row) => row.sessionDate), ...sessions.map((row) => row.sessionDate)]);
  return Array.from({ length: days }, (_, i) => addDays(from, i)).flatMap((date) => {
    const day = cycleDay(protocol, date);
    if (!day || occupied.has(date)) return [];
    return [{ id: "", sessionDate: date, dayKind: day.prescription ? "training" as const : "rest" as const, protocolId: protocol.id, prescription: day.prescription, plannedStart: day.prescription ? protocol.trainingStartLocal : null, timeZone: protocol.timeZone, status: "planned" as const, revision: 0, manuallyEdited: false }];
  });
}

export function setsFromPrescription(day: ProgramDay, id: () => string): WorkoutSet[] {
  return day.exercises.flatMap((item) => Array.from({ length: item.sets }, (_, i) => ({
    id: id(), exercise: item.exercise, exerciseId: item.exerciseId, muscleGroup: item.muscleGroup,
    weightKg: null, reps: null, rir: null, isWarmup: false, completed: false, loadType: item.loadType ?? "external",
    ...(item.loadType === "timed" ? { durationSeconds: null } : {}),
    prescription: item.prescription?.[i] ?? { repRange: item.repRange, targetRir: item.targetRir, kind: "straight" as const },
  })));
}

export function equivalentWeeklySets(sets: number, days: number): number {
  if (!Number.isFinite(sets) || sets < 0 || !Number.isFinite(days) || days <= 0) throw new Error("统计周期无效。");
  return sets * 7 / days;
}

export function completedSetSummary(sessions: WorkoutSession[]): { total: number; closeToFailure: number } {
  const ids = new Set<string>(); let total = 0; let closeToFailure = 0;
  for (const session of sessions) for (const set of session.sets) {
    if (set.completed !== true || set.isWarmup || ids.has(set.id)) continue;
    ids.add(set.id); total++;
    if (set.rir != null && set.rir >= 0 && set.rir <= 3) closeToFailure++;
  }
  return { total, closeToFailure };
}

/** 仅顺延尚未实练、未人工改过的连续排期；保留两天空档，避免连续补课。 */
export function previewScheduleDelay(schedules: WorkoutSchedule[], sessions: WorkoutSession[], from: string, delayDays: number): WorkoutSchedule[] {
  if (!isDateKey(from) || !Number.isInteger(delayDays) || delayDays < 2 || delayDays > 8) throw new Error("顺延至少保留两天恢复间隔。");
  const source = schedules.filter(s => s.sessionDate >= from).sort((a,b) => a.sessionDate.localeCompare(b.sessionDate));
  if (!source.length || source[0].sessionDate !== from) throw new Error("请先生成从所选日开始的连续排期。");
  if (source.some(s => s.manuallyEdited || s.status !== "planned" || s.protocolId !== source[0].protocolId)) throw new Error("未来含人工例外或不同协议，请仅修改本日。");
  const last = addDays(source.at(-1)!.sessionDate, delayDays);
  if (sessions.some(s => s.sessionDate >= from && s.sessionDate <= last)) throw new Error("顺延区间已有实际/待核验日志，不能覆盖。");
  if (source.some((s,i) => s.sessionDate !== addDays(from,i))) throw new Error("排期不连续，请先补齐预览。");
  const rows: WorkoutSchedule[] = [];
  for (let i=0; i<source.length+delayDays; i++) {
    const date = addDays(from,i); const old = schedules.find(s => s.sessionDate === date); const origin = source[i-delayDays];
    rows.push({ ...(origin ?? source[0]), id: old?.id ?? "", sessionDate: date, revision: old?.revision ?? 0, manuallyEdited: true, ...(origin ? {} : { dayKind: "rest", prescription: null, plannedStart: null }) });
  }
  return rows;
}
