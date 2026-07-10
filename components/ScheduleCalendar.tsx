"use client";

import type { User } from "@supabase/supabase-js";
import { CalendarCheck, ChevronLeft, ChevronRight, Dumbbell, Trash2, Utensils } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadBodyLogs, mergeLatestBodyMetrics, type BodyLog } from "@/lib/bodyLogs";
import { emptyProfile } from "@/lib/demoState";
import { buildNutritionResult, isProfileComplete, round } from "@/lib/nutrition";
import { loadPlannerDraft, loadPlans, savePlan } from "@/lib/storage";
import { applyDeloadToTemplate, isDeloadWeek, muscleGroupLabels, programTemplates, splitLabels, toDateKey, weekStartKey } from "@/lib/training";
import { useDeloadWeeks } from "@/components/useDeloadWeeks";
import { deleteWorkoutSession, loadWorkoutSessions, saveWorkoutSession, TrainingAuthError } from "@/lib/trainingStorage";
import type { FoodItem, SavedPlan, TrainingSplit, WorkoutSession, WorkoutSet } from "@/lib/types";

interface ScheduleCalendarProps {
  user: User | null;
  foods: FoodItem[];
  onGoTraining: (date: string) => void;
  onGoPlanner: (date: string, plan: SavedPlan | null) => void;
}

function monthMatrix(cursor: Date): Array<Array<{ date: Date; key: string; inMonth: boolean }>> {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const cell = new Date(year, month, 1 - startOffset);
  const weeks: Array<Array<{ date: Date; key: string; inMonth: boolean }>> = [];
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

export function ScheduleCalendar({ user, foods, onGoTraining, onGoPlanner }: ScheduleCalendarProps) {
  const todayKey = toDateKey(new Date());
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [split, setSplit] = useState<TrainingSplit>("fiveDayV2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const monthRange = useMemo(() => {
    const from = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
    const to = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 2, 0);
    return { from: toDateKey(from), to: toDateKey(to) };
  }, [monthCursor]);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }
    setError(null);
    try {
      const [sessionData, planData] = await Promise.all([
        loadWorkoutSessions(user, monthRange.from, monthRange.to),
        loadPlans(user)
      ]);
      setSessions(sessionData);
      setPlans(planData);
    } catch (err) {
      setError(err instanceof TrainingAuthError ? err.message : "加载安排失败，请检查 Supabase 连接。");
    }
  }, [user, monthRange.from, monthRange.to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sessionsByDate = useMemo(() => new Map(sessions.map((s) => [s.sessionDate, s])), [sessions]);
  const plansByDate = useMemo(() => new Map(plans.map((p) => [p.planDate, p])), [plans]);
  const weeks = useMemo(() => monthMatrix(monthCursor), [monthCursor]);

  const selectedSession = sessionsByDate.get(selectedDate) ?? null;
  const selectedPlan = plansByDate.get(selectedDate) ?? null;

  // 减载周：与训练日历共用同一份按周标记；选中日期落在减载周时，排期用减载版模板。
  const { deloadWeeks, toggleDeloadWeek } = useDeloadWeeks(user);
  const deloadActive = isDeloadWeek(selectedDate, deloadWeeks);
  const template = useMemo(
    () => (deloadActive ? applyDeloadToTemplate(programTemplates[split]) : programTemplates[split]),
    [split, deloadActive]
  );

  async function handleToggleDeload() {
    const saved = await toggleDeloadWeek(selectedDate);
    if (!saved) {
      setError("减载周标记保存失败，请重试。");
    }
  }

  async function assignTraining(dayIndex: number) {
    if (!user) {
      return;
    }
    const day = template.days[dayIndex];
    const sets: WorkoutSet[] = day.exercises.flatMap((ex) =>
      Array.from({ length: ex.sets }, () => ({
        id: crypto.randomUUID(),
        exercise: ex.exercise,
        muscleGroup: ex.muscleGroup,
        weightKg: 0,
        reps: ex.repRange[0],
        rir: ex.targetRir,
        isWarmup: false
      }))
    );
    const session: WorkoutSession = {
      id: selectedSession?.id ?? "",
      sessionDate: selectedDate,
      splitLabel: day.splitLabel,
      bodyweightKg: selectedSession?.bodyweightKg ?? null,
      recovery: selectedSession?.recovery ?? null,
      note: selectedSession?.note ?? "",
      sets,
      createdAt: selectedSession?.createdAt ?? ""
    };
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await saveWorkoutSession(session, user);
      await refresh();
      setMessage(`已排：${selectedDate} → ${day.splitLabel}。逐组重量去训练日历填写。`);
    } catch (err) {
      setError(err instanceof TrainingAuthError ? err.message : "保存训练安排失败。");
    } finally {
      setBusy(false);
    }
  }

  async function clearTraining() {
    if (!user || !selectedSession) {
      return;
    }
    setBusy(true);
    try {
      await deleteWorkoutSession(selectedDate, user);
      await refresh();
      setMessage(`已清除 ${selectedDate} 的训练安排。`);
    } catch (err) {
      setError(err instanceof TrainingAuthError ? err.message : "清除失败。");
    } finally {
      setBusy(false);
    }
  }

  async function generateDietTarget() {
    if (!user) {
      return;
    }
    const [draft, bodyLogs] = await Promise.all([
      loadPlannerDraft(user).catch(() => null),
      loadBodyLogs(user, 60).catch(() => [] as BodyLog[])
    ]);
    // 与计划页同一套档案数据流：草稿为基底（无草稿=空白档案），最新体测覆盖体重/体脂。
    const baseProfile = mergeLatestBodyMetrics(draft?.profile ?? emptyProfile, bodyLogs);
    if (!isProfileComplete(baseProfile)) {
      setError("身体档案还没填：先到「当天计划」填年龄/身高/体重（或记一条体测），再生成目标。");
      return;
    }
    const profile = { ...baseProfile, planDate: selectedDate };
    const result = buildNutritionResult(profile, [], foods);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await savePlan(profile, [], result, user);
      await refresh();
      setMessage(`已生成 ${selectedDate} 的饮食目标骨架（${round(result.dailyTarget.kcal, 0)} kcal）。详细分餐去当天计划。`);
    } catch {
      setError("生成饮食目标失败。");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <section className="panel flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/[0.12] text-accent ring-1 ring-accent/25">
          <CalendarCheck size={26} />
        </div>
        <h2 className="text-lg font-semibold text-ink">安排日历需要登录</h2>
        <p className="max-w-sm text-sm text-muted">训练与饮食安排均保存在 Supabase 云端，登录后可在同一张日历统筹排期。</p>
      </section>
    );
  }

  const monthLabel = `${monthCursor.getFullYear()} 年 ${monthCursor.getMonth() + 1} 月`;
  const weekdayHeads = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      {/* 月历 */}
      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">训练 · 饮食安排日历</h2>
            <p className="text-xs text-muted">每格同时显示训练与饮食目标；点某天排期。</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-accent/50 hover:bg-accent/15 hover:text-accent" type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} aria-label="上个月">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[110px] text-center text-sm font-medium text-ink">{monthLabel}</span>
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-accent/50 hover:bg-accent/15 hover:text-accent" type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} aria-label="下个月">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekdayHeads.map((d) => (
            <div key={d} className="py-1 text-center text-[11px] font-semibold text-muted">{d}</div>
          ))}
          {weeks.flat().map((cell) => {
            const session = sessionsByDate.get(cell.key);
            const plan = plansByDate.get(cell.key);
            const isSelected = cell.key === selectedDate;
            const isToday = cell.key === todayKey;
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => { setSelectedDate(cell.key); setMessage(null); setError(null); }}
                className={`flex min-h-[68px] flex-col rounded-lg border p-1.5 text-left transition-colors ${
                  isSelected ? "border-accent bg-accent/15" : cell.inMonth ? "border-line bg-black/[0.02] hover:border-accent/40" : "border-transparent opacity-55"
                }`}
              >
                <span className={`text-xs ${isToday ? "font-bold text-accent" : "text-ink"}`}>{cell.date.getDate()}</span>
                {session ? (
                  <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-ink">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="truncate">{session.splitLabel}</span>
                  </span>
                ) : null}
                {plan ? (
                  <span className="mt-auto truncate text-[10px] text-muted">🍚 {round(plan.result.dailyTarget.kcal, 0)}kcal</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent" />已排训练</span>
          <span>🍚 = 已排饮食目标</span>
        </div>
      </section>

      {/* 排期面板 */}
      <section className="panel flex flex-col gap-4 p-4">
        <h2 className="text-base font-semibold text-ink">{selectedDate} 排期</h2>

        {/* 训练 */}
        <div className="rounded-xl border border-line bg-panel/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Dumbbell size={15} className="text-accent" /> 训练</h3>
            <div className="flex items-center gap-1">
              {(Object.keys(splitLabels) as TrainingSplit[]).map((key) => (
                <button key={key} type="button" className={`rounded px-2 py-0.5 text-[11px] ${split === key ? "bg-accent/20 text-accent" : "text-muted hover:text-ink"}`} onClick={() => setSplit(key)}>
                  {key === "fiveDayV2" ? "v2" : key === "pplLumbarSafe" ? "腰突" : key === "upperLower" ? "上下" : "全身"}
                </button>
              ))}
              <label
                className={`flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[11px] ${deloadActive ? "bg-accent/20 text-accent" : "text-muted hover:text-ink"}`}
                title={`标记 ${weekStartKey(selectedDate)} 起的一周为减载周`}
              >
                <input type="checkbox" className="h-3 w-3 accent-[#D97757]" checked={deloadActive} onChange={handleToggleDeload} />
                减载
              </label>
            </div>
          </div>
          {deloadActive ? (
            <p className="mb-2 rounded-lg border border-accent/30 bg-accent/[0.07] px-2.5 py-1.5 text-[11px] leading-relaxed text-ink">
              减载周：模板为减载版（组数减半、留 4–5 RIR）；重量 85–90%，停用拉长半程/递减组。
            </p>
          ) : null}
          {selectedSession ? (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-accent/[0.08] px-2.5 py-1.5 text-xs">
              <span className="text-ink">已排：{selectedSession.splitLabel} · {selectedSession.sets.length} 组</span>
              <button className="btn-danger h-7 px-2" type="button" onClick={clearTraining} disabled={busy} title="清除"><Trash2 size={13} /></button>
            </div>
          ) : (
            <p className="mb-2 text-xs text-muted">未排训练。选下面任一训练日排入：</p>
          )}
          <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1">
            {template.days.map((day, index) => (
              <button
                key={day.dayLabel}
                type="button"
                disabled={busy}
                onClick={() => assignTraining(index)}
                className="min-w-[104px] shrink-0 rounded-lg border border-line bg-surface/40 px-2 py-1.5 text-left transition-colors hover:border-accent/30"
              >
                <div className="text-[11px] font-semibold text-ink">{day.dayLabel}</div>
                <div className="truncate text-[10px] text-muted">{day.muscleGroups.map((m) => muscleGroupLabels[m]).join("·")}</div>
              </button>
            ))}
          </div>
          <button className="btn-secondary mt-2 h-8 w-full text-xs" type="button" onClick={() => onGoTraining(selectedDate)}>去训练日历逐组填写 →</button>
        </div>

        {/* 饮食 */}
        <div className="rounded-xl border border-line bg-panel/40 p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><Utensils size={15} className="text-accent" /> 饮食</h3>
          {selectedPlan ? (
            <div className="mb-2 rounded-lg bg-accent/[0.08] px-2.5 py-1.5 text-xs text-ink">
              已排目标：{round(selectedPlan.result.dailyTarget.kcal, 0)} kcal · 碳 {round(selectedPlan.result.dailyTarget.carbs, 0)}g / 蛋 {round(selectedPlan.result.dailyTarget.protein, 0)}g / 脂 {round(selectedPlan.result.dailyTarget.fat, 0)}g
            </div>
          ) : (
            <p className="mb-2 text-xs text-muted">未排饮食目标。可一键生成当日固定目标骨架（2300 kcal 档案值）。</p>
          )}
          <div className="flex gap-2">
            <button className="btn-primary h-8 flex-1 text-xs" type="button" onClick={generateDietTarget} disabled={busy}>
              {selectedPlan ? "重新生成饮食目标" : "生成饮食目标"}
            </button>
            <button className="btn-secondary h-8 px-3 text-xs" type="button" onClick={() => onGoPlanner(selectedDate, selectedPlan)}>去分餐 →</button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">目标按档案身体数据（体重/体脂随体测）经 v2 公式与现有求解器计算，数学与分餐一致。</p>
        </div>

        {message ? <p className="rounded-lg border border-accent/30 bg-accent/[0.07] px-3 py-2 text-xs text-ink">{message}</p> : null}
        {error ? <p className="rounded-lg border border-rose/35 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</p> : null}
      </section>
    </div>
  );
}
