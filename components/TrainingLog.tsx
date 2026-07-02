"use client";

import type { User } from "@supabase/supabase-js";
import { CalendarRange, ChevronLeft, ChevronRight, LogIn, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  autoregulate,
  bestE1RMByExercise,
  carbDayLabelsForTraining,
  intensityZones,
  muscleGroupLabels,
  muscleGroupOrder,
  programTemplates,
  rpeFromRir,
  sessionTonnage,
  splitLabels,
  toDateKey,
  volumeLandmarks,
  volumeStatus,
  volumeStatusLabels,
  weeklyWorkingSets,
  weekStartKey
} from "@/lib/training";
import { deleteWorkoutSession, loadWorkoutSessions, saveWorkoutSession, TrainingAuthError } from "@/lib/trainingStorage";
import type { CarbDayType, ExperienceLevel, MuscleGroup, TrainingSplit, WorkoutSession, WorkoutSet } from "@/lib/types";

interface TrainingLogProps {
  user: User | null;
  onRequireLogin: () => void;
  /** 从安排日历跳转：nonce 变化时把日历定位到该日并选中。 */
  dateRequest?: { date: string; nonce: number } | null;
}

const carbDayDotClass: Record<CarbDayType, string> = {
  high: "bg-accent",
  mid: "bg-accent/45",
  low: "bg-white/20"
};

const experienceLabels: Record<ExperienceLevel, string> = {
  beginner: "新手",
  intermediate: "中级",
  advanced: "进阶"
};

function blankSession(dateKey: string): WorkoutSession {
  return {
    id: "",
    sessionDate: dateKey,
    splitLabel: "",
    carbDayType: "low",
    bodyweightKg: null,
    recovery: null,
    note: "",
    sets: [],
    createdAt: ""
  };
}

function newSet(partial?: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: crypto.randomUUID(),
    exercise: partial?.exercise ?? "",
    muscleGroup: partial?.muscleGroup ?? "chest",
    weightKg: partial?.weightKg ?? 0,
    reps: partial?.reps ?? 0,
    rir: partial?.rir ?? 2,
    isWarmup: partial?.isWarmup ?? false
  };
}

/** 生成当月日历矩阵（周一为起点）。 */
function monthMatrix(cursor: Date): Array<Array<{ date: Date; key: string; inMonth: boolean }>> {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一=0
  const gridStart = new Date(year, month, 1 - startOffset);
  const weeks: Array<Array<{ date: Date; key: string; inMonth: boolean }>> = [];
  const cell = new Date(gridStart);
  for (let w = 0; w < 6; w += 1) {
    const row: Array<{ date: Date; key: string; inMonth: boolean }> = [];
    for (let d = 0; d < 7; d += 1) {
      row.push({ date: new Date(cell), key: toDateKey(cell), inMonth: cell.getMonth() === month });
      cell.setDate(cell.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

export function TrainingLog({ user, onRequireLogin, dateRequest }: TrainingLogProps) {
  const todayKey = toDateKey(new Date());
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [draft, setDraft] = useState<WorkoutSession>(() => blankSession(todayKey));
  const [split, setSplit] = useState<TrainingSplit>("ppl");
  const [experience, setExperience] = useState<ExperienceLevel>("intermediate");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthRange = useMemo(() => {
    const from = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
    const to = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 2, 0);
    return { from: toDateKey(from), to: toDateKey(to) };
  }, [monthCursor]);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSessions(await loadWorkoutSessions(user, monthRange.from, monthRange.to));
    } catch (err) {
      if (err instanceof TrainingAuthError) {
        setError(err.message);
      } else {
        setError("加载训练记录失败，请检查 Supabase 连接。");
      }
    } finally {
      setLoading(false);
    }
  }, [user, monthRange.from, monthRange.to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 从安排日历跳转：定位月历到目标日期并选中。
  useEffect(() => {
    if (!dateRequest) {
      return;
    }
    const target = new Date(`${dateRequest.date}T00:00:00`);
    setMonthCursor(new Date(target.getFullYear(), target.getMonth(), 1));
    setSelectedDate(dateRequest.date);
  }, [dateRequest]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, WorkoutSession>();
    for (const session of sessions) {
      map.set(session.sessionDate, session);
    }
    return map;
  }, [sessions]);

  // 切换选中日期时，载入已有记录或建一张空白草稿。
  useEffect(() => {
    const existing = sessionsByDate.get(selectedDate);
    setDraft(existing ? structuredClone(existing) : blankSession(selectedDate));
  }, [selectedDate, sessionsByDate]);

  const weeks = useMemo(() => monthMatrix(monthCursor), [monthCursor]);
  const template = programTemplates[split];

  const weeklyCounts = useMemo(
    () => weeklyWorkingSets(sessions, weekStartKey(selectedDate)),
    [sessions, selectedDate]
  );
  const landmarks = volumeLandmarks[experience];

  const tonnage = sessionTonnage(draft);
  const e1rms = bestE1RMByExercise(draft);
  const workingSetCount = draft.sets.filter((set) => !set.isWarmup).length;

  function updateDraft(patch: Partial<WorkoutSession>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function updateSet(id: string, patch: Partial<WorkoutSet>) {
    setDraft((prev) => ({ ...prev, sets: prev.sets.map((set) => (set.id === id ? { ...set, ...patch } : set)) }));
  }

  function addSet() {
    const last = draft.sets[draft.sets.length - 1];
    setDraft((prev) => ({
      ...prev,
      sets: [...prev.sets, newSet(last ? { exercise: last.exercise, muscleGroup: last.muscleGroup, weightKg: last.weightKg, reps: last.reps, rir: last.rir } : undefined)]
    }));
  }

  function removeSet(id: string) {
    setDraft((prev) => ({ ...prev, sets: prev.sets.filter((set) => set.id !== id) }));
  }

  function applyTemplateDay(dayIndex: number) {
    const day = template.days[dayIndex];
    const expanded: WorkoutSet[] = day.exercises.flatMap((ex) =>
      Array.from({ length: ex.sets }, () => newSet({ exercise: ex.exercise, muscleGroup: ex.muscleGroup, reps: ex.repRange[0], rir: ex.targetRir }))
    );
    updateDraft({ splitLabel: day.splitLabel, carbDayType: day.carbDay, sets: expanded });
  }

  async function handleSave() {
    if (!user) {
      onRequireLogin();
      return;
    }
    if (draft.sets.length === 0 && !draft.splitLabel) {
      setError("请先填写训练内容（套用模板某天或手动添加组）。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveWorkoutSession({ ...draft, splitLabel: draft.splitLabel || "自定义训练" }, user);
      await refresh();
    } catch (err) {
      setError(err instanceof TrainingAuthError ? err.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!user) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deleteWorkoutSession(selectedDate, user);
      await refresh();
      setDraft(blankSession(selectedDate));
    } catch (err) {
      setError(err instanceof TrainingAuthError ? err.message : "删除失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <section className="panel flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/[0.12] text-accent ring-1 ring-accent/25">
          <CalendarRange size={26} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">训练日历需要登录</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            训练记录仅保存在 Supabase 云端（不写本地浏览器存储），登录后即可逐日逐组记录并自动计算。
          </p>
        </div>
        <button className="btn-primary px-5" type="button" onClick={onRequireLogin}>
          <LogIn size={16} />
          去登录
        </button>
      </section>
    );
  }

  const monthLabel = `${monthCursor.getFullYear()} 年 ${monthCursor.getMonth() + 1} 月`;
  const weekdayHeads = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <div className="flex flex-col gap-5">
      {/* 方案模板选择 + 周排期条带（升级版「五分化」） */}
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">训练方案模板</h2>
            <p className="mt-0.5 text-xs text-muted">{template.summary}</p>
          </div>
          <div className="flex gap-1.5">
            {(Object.keys(splitLabels) as TrainingSplit[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  split === key ? "bg-accent text-accent-ink" : "border border-line bg-white/[0.04] text-muted hover:text-ink"
                }`}
                onClick={() => setSplit(key)}
              >
                {splitLabels[key]}
              </button>
            ))}
          </div>
        </div>
        <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {template.days.map((day, index) => (
            <button
              key={day.dayLabel}
              type="button"
              onClick={() => applyTemplateDay(index)}
              title="点击套用到当前选中日期"
              className={`min-w-[120px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                day.carbDay === "high" ? "border-accent/40 bg-accent/[0.08]" : "border-line bg-surface/40 hover:border-accent/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-ink">{day.dayLabel}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${day.carbDay === "high" ? "bg-accent/15 text-accent" : "text-muted"}`}>
                  {carbDayLabelsForTraining[day.carbDay]}
                </span>
              </div>
              <div className="mt-1 text-xs font-medium text-ink">{day.splitLabel}</div>
              <div className="mt-0.5 truncate text-[10px] text-muted">
                {day.muscleGroups.map((m) => muscleGroupLabels[m]).join(" · ")}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">点任一训练日 → 自动把动作与目标 RIR 填入下方选中日期，逐组填重量即可。</p>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* 日历 */}
        <section className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">训练日历</h2>
            <div className="flex items-center gap-2">
              <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/[0.08] text-ink transition-colors hover:border-accent/50 hover:bg-accent/15 hover:text-accent" type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} aria-label="上个月">
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[110px] text-center text-sm font-medium text-ink">{monthLabel}</span>
              <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/[0.08] text-ink transition-colors hover:border-accent/50 hover:bg-accent/15 hover:text-accent" type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} aria-label="下个月">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdayHeads.map((d) => (
              <div key={d} className="py-1 text-[11px] font-semibold text-muted">{d}</div>
            ))}
            {weeks.flat().map((cell) => {
              const session = sessionsByDate.get(cell.key);
              const isSelected = cell.key === selectedDate;
              const isToday = cell.key === todayKey;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDate(cell.key)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors ${
                    isSelected
                      ? "border-accent bg-accent/15 text-ink"
                      : cell.inMonth
                        ? "border-line bg-white/[0.03] text-ink hover:border-accent/40"
                        : "border-transparent text-muted/55"
                  }`}
                >
                  <span className={isToday ? "font-bold text-accent" : ""}>{cell.date.getDate()}</span>
                  {session ? <span className={`mt-1 h-1.5 w-1.5 rounded-full ${carbDayDotClass[session.carbDayType]}`} /> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent" />高碳</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent/45" />中碳</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/20" />低碳</span>
            {loading ? <span className="ml-auto">加载中…</span> : null}
          </div>

          {/* 当周训练量地标 */}
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">本周训练量（{weekStartKey(selectedDate)} 起）</h3>
              <div className="flex gap-1">
                {(Object.keys(experienceLabels) as ExperienceLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    className={`rounded px-2 py-0.5 text-[11px] ${experience === lvl ? "bg-accent/20 text-accent" : "text-muted hover:text-ink"}`}
                    onClick={() => setExperience(lvl)}
                  >
                    {experienceLabels[lvl]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {muscleGroupOrder
                .filter((m) => weeklyCounts[m] > 0)
                .map((m) => {
                  const sets = weeklyCounts[m];
                  const lm = landmarks[m];
                  const status = volumeStatus(sets, lm);
                  const pct = Math.min(100, (sets / lm.mrv) * 100);
                  const barColor =
                    status === "under" ? "bg-[#5cc1f0]/80" : status === "over" ? "bg-rose/80" : status === "near-max" ? "bg-[#e0a23a]/85" : "bg-accent/80";
                  return (
                    <div key={m} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-ink">{muscleGroupLabels[m]}</span>
                        <span className="text-muted">{sets} 组 · {volumeStatusLabels[status]}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]" title={`MEV ${lm.mev} / MAV ${lm.mav} / MRV ${lm.mrv}`}>
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              {muscleGroupOrder.every((m) => weeklyCounts[m] === 0) ? (
                <p className="text-xs text-muted">本周还没有训练记录。</p>
              ) : null}
            </div>
          </div>
        </section>

        {/* 当日逐组录入 */}
        <section className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink">{selectedDate} 训练记录</h2>
              <p className="text-xs text-muted">{draft.id ? "已保存 · 可修改" : "未记录 · 新建中"}</p>
            </div>
            <div className="text-right">
              <div className="metric-label">容量</div>
              <div className="text-lg font-semibold text-accent">{tonnage.toLocaleString()} kg</div>
            </div>
          </div>

          {/* 元信息 */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="metric-label">部位/分化</span>
              <input className="field" value={draft.splitLabel} placeholder="如 腿 Legs" onChange={(e) => updateDraft({ splitLabel: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="metric-label">碳水日</span>
              <select className="field" value={draft.carbDayType} onChange={(e) => updateDraft({ carbDayType: e.target.value as CarbDayType })}>
                {(Object.keys(carbDayLabelsForTraining) as CarbDayType[]).map((c) => (
                  <option key={c} value={c}>{carbDayLabelsForTraining[c]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="metric-label">体重 kg</span>
              <input className="field" type="number" inputMode="decimal" value={draft.bodyweightKg ?? ""} placeholder="—" onChange={(e) => updateDraft({ bodyweightKg: e.target.value === "" ? null : Number(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="metric-label">恢复 1–5</span>
              <select className="field" value={draft.recovery ?? ""} onChange={(e) => updateDraft({ recovery: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>

          {/* 逐组表 */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">逐组记录（{workingSetCount} 有效组）</h3>
              <button className="btn-secondary h-8 px-2.5 text-xs" type="button" onClick={addSet}>
                <Plus size={14} /> 加一组
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="hidden grid-cols-[1.6fr_1fr_0.9fr_0.7fr_0.7fr_auto] gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted sm:grid">
                <span>动作</span><span>部位</span><span>重量kg</span><span>次数</span><span>RIR</span><span></span>
              </div>
              {draft.sets.map((set) => (
                <div key={set.id} className="grid grid-cols-2 gap-1.5 rounded-lg border border-line bg-white/[0.02] p-1.5 sm:grid-cols-[1.6fr_1fr_0.9fr_0.7fr_0.7fr_auto] sm:border-0 sm:bg-transparent sm:p-0">
                  <input className="field h-9" value={set.exercise} placeholder="动作" onChange={(e) => updateSet(set.id, { exercise: e.target.value })} />
                  <select className="field h-9" value={set.muscleGroup} onChange={(e) => updateSet(set.id, { muscleGroup: e.target.value as MuscleGroup })}>
                    {muscleGroupOrder.map((m) => (
                      <option key={m} value={m}>{muscleGroupLabels[m]}</option>
                    ))}
                  </select>
                  <input className="field h-9" type="number" inputMode="decimal" value={set.weightKg || ""} placeholder="0" onChange={(e) => updateSet(set.id, { weightKg: Number(e.target.value) || 0 })} />
                  <input className="field h-9" type="number" inputMode="numeric" value={set.reps || ""} placeholder="0" onChange={(e) => updateSet(set.id, { reps: Number(e.target.value) || 0 })} />
                  <input className="field h-9" type="number" inputMode="numeric" value={set.rir ?? ""} placeholder="—" title="剩余次数 RIR" onChange={(e) => updateSet(set.id, { rir: e.target.value === "" ? null : Number(e.target.value) })} />
                  <div className="col-span-2 flex items-center justify-between gap-1 sm:col-span-1 sm:justify-end">
                    <label className="flex items-center gap-1 text-[11px] text-muted">
                      <input type="checkbox" checked={set.isWarmup} onChange={(e) => updateSet(set.id, { isWarmup: e.target.checked })} /> 热身
                    </label>
                    <button className="btn-danger h-8 w-8 px-0" type="button" onClick={() => removeSet(set.id)} aria-label="删除该组">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {draft.sets.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line py-4 text-center text-xs text-muted">
                  还没有组。点上方模板某天快速填入，或「加一组」手动录入。
                </p>
              ) : null}
            </div>
          </div>

          {/* 计算结果 */}
          {e1rms.length > 0 ? (
            <div className="mt-4 rounded-xl border border-line bg-panel/40 p-3">
              <h3 className="mb-2 text-sm font-semibold text-ink">本次估算 1RM（E1RM）</h3>
              <div className="flex flex-wrap gap-2">
                {e1rms.map((item) => (
                  <span key={item.exercise} className="rounded-lg border border-accent/30 bg-accent/[0.08] px-2.5 py-1 text-xs text-ink">
                    {item.exercise} <span className="font-semibold text-accent">{item.e1rm} kg</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-3 rounded-lg border border-rose/35 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</p> : null}

          <div className="mt-4 flex gap-2">
            <button className="btn-primary flex-1" type="button" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? "保存中…" : "保存到 Supabase"}
            </button>
            {draft.id ? (
              <button className="btn-danger px-4" type="button" onClick={handleDelete} disabled={saving}>
                <Trash2 size={16} /> 删除
              </button>
            ) : null}
          </div>
        </section>
      </div>

      {/* 参考：强度区间 + RIR 自动调节 */}
      <ReferencePanel />
    </div>
  );
}

function ReferencePanel() {
  const [targetRir, setTargetRir] = useState(2);
  const [actualRir, setActualRir] = useState(2);
  const suggestion = autoregulate(targetRir, actualRir);

  return (
    <section className="panel p-4">
      <h2 className="mb-3 text-base font-semibold text-ink">训练强度参考与自动调节</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">%1RM ↔ 次数 ↔ 目标（NSCA）</h3>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.04] text-muted">
                <tr><th className="px-3 py-2 text-left">目标</th><th className="px-3 py-2">%1RM</th><th className="px-3 py-2">次数</th></tr>
              </thead>
              <tbody>
                {intensityZones.map((zone) => (
                  <tr key={zone.goal} className="border-t border-line text-ink">
                    <td className="px-3 py-2">{zone.goal}</td>
                    <td className="px-3 py-2 text-center">{zone.pctMin === 0 ? `<${zone.pctMax}` : `${zone.pctMin}–${zone.pctMax}`}%</td>
                    <td className="px-3 py-2 text-center">{zone.repMin}–{zone.repMax}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">RIR 自动调节（下次负荷建议）</h3>
          <div className="flex items-end gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="metric-label">目标 RIR</span>
              <input className="field w-full min-w-0" type="number" value={targetRir} onChange={(e) => setTargetRir(Number(e.target.value) || 0)} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="metric-label">实际 RIR</span>
              <input className="field w-full min-w-0" type="number" value={actualRir} onChange={(e) => setActualRir(Number(e.target.value) || 0)} />
            </label>
          </div>
          <div className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.07] p-3 text-sm text-ink">
            <div className="text-xs text-muted">建议(RPE {rpeFromRir(actualRir)})</div>
            <div className="mt-0.5 font-medium">
              {suggestion.loadPct > 0 ? `▲ +${suggestion.loadPct}%` : suggestion.loadPct < 0 ? `▼ ${suggestion.loadPct}%` : "维持"} · {suggestion.note}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">证据：1–3 RIR 与练到力竭在容量相等时肥大几乎无差异；大复合动作不建议练到力竭。</p>
        </div>
      </div>
    </section>
  );
}
