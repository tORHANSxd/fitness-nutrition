"use client";

import type { User } from "@supabase/supabase-js";
import { Check, CircleDot, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlannerController } from "@/components/usePlanner";
import { buildDailyActual } from "@/lib/heatmap";
import { canonicalEnergy, displayEnergy, type EnergyUnit } from "@/lib/preferences";
import { loadDailyCheckin, saveDailyCheckin } from "@/lib/storage";
import type { DailyCheckin, ExerciseEnergyEntry } from "@/lib/types";

const noExercises: ExerciseEnergyEntry[] = [];

export function DailyCheckinPanel({
  controller,
  date,
  today,
  user,
  energyUnit
}: {
  controller: PlannerController;
  date: string;
  today: string;
  user: User;
  energyUnit: EnergyUnit;
}) {
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exerciseName, setExerciseName] = useState("");
  const [exerciseEnergy, setExerciseEnergy] = useState("");
  const [message, setMessage] = useState("");
  const ready = controller.profile.planDate === date;
  const isFuture = date > today;
  const exercises = checkin?.actual.exercises ?? noExercises;

  const liveActual = useMemo(
    () => buildDailyActual(controller.profile, controller.meals, controller.result, controller.foodsById, exercises),
    [controller.foodsById, controller.meals, controller.profile, controller.result, exercises]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("");
    loadDailyCheckin(date, user)
      .then((record) => {
        if (!cancelled) {
          setCheckin(record);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCheckin(null);
          setMessage(error instanceof Error ? error.message : "实际记录加载失败。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, user]);

  async function persistExercises(nextExercises: ExerciseEnergyEntry[]) {
    const keepConfirmedFoodSnapshot = checkin?.completed ?? false;
    const actual = keepConfirmedFoodSnapshot
      ? { ...checkin!.actual, exercises: nextExercises }
      : { ...liveActual, exercises: nextExercises };
    return saveDailyCheckin({
      planDate: date,
      actual,
      target: keepConfirmedFoodSnapshot ? checkin?.target ?? controller.result.dailyTarget : controller.result.dailyTarget,
      completed: keepConfirmedFoodSnapshot
    }, user);
  }

  async function addExercise() {
    const name = exerciseName.trim();
    const enteredEnergy = Number(exerciseEnergy);
    const kcal = canonicalEnergy(enteredEnergy, energyUnit);
    if (!name || !Number.isFinite(kcal) || kcal <= 0 || kcal > 10000) {
      setMessage(`请输入运动名称和有效消耗（最多 ${Math.round(displayEnergy(10000, energyUnit))} ${energyUnit === "kj" ? "kJ" : "kcal"}）。`);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const saved = await persistExercises([
        ...exercises,
        { id: crypto.randomUUID(), name, kcal: Math.round(kcal * 10) / 10 }
      ]);
      setCheckin(saved);
      setExerciseName("");
      setExerciseEnergy("");
      setMessage("运动消耗已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "运动消耗保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function removeExercise(id: string) {
    setSaving(true);
    setMessage("");
    try {
      setCheckin(await persistExercises(exercises.filter((exercise) => exercise.id !== id)));
      setMessage("运动记录已删除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "运动记录删除失败。");
    } finally {
      setSaving(false);
    }
  }

  async function completeDay() {
    if (!ready || isFuture) {
      return;
    }
    setSaving(true);
    setMessage("");
    const planSaved = await controller.persistPlan();
    if (!planSaved) {
      setMessage("计划保存失败，本日记录未完成。");
      setSaving(false);
      return;
    }
    try {
      const saved = await saveDailyCheckin({
        planDate: date,
        actual: liveActual,
        target: controller.result.dailyTarget,
        completed: true
      }, user);
      setCheckin(saved);
      setMessage("当日记录已完成。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "当日记录确认失败。");
    } finally {
      setSaving(false);
    }
  }

  async function reopenDay() {
    if (!checkin) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      setCheckin(await saveDailyCheckin({
        planDate: date,
        actual: checkin.actual,
        target: checkin.target,
        completed: false
      }, user));
      setMessage("已恢复为记录中。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态更新失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel overflow-hidden" aria-labelledby="daily-checkin-title">
      <header className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="eyebrow">ACTUAL LEDGER</p>
          <h3 id="daily-checkin-title" className="mt-1 text-lg text-ink">实际记录</h3>
        </div>
        <span className={`inline-flex items-center gap-2 text-xs font-semibold ${checkin?.completed ? "text-success" : "text-muted"}`}>
          {checkin?.completed ? <Check size={15} /> : <CircleDot size={15} />}
          {checkin?.completed ? "已完成" : "记录中"}
        </span>
      </header>

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
        <div className="min-w-0 border-b border-line p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end">
            <label className="grid gap-1.5 text-xs font-semibold text-muted">
              运动名称
              <input
                className="field"
                value={exerciseName}
                onChange={(event) => setExerciseName(event.target.value)}
                placeholder="例如：跑步"
                maxLength={60}
                disabled={loading || saving || isFuture}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted">
              消耗 {energyUnit === "kj" ? "kJ" : "kcal"}
              <input
                className="field"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={exerciseEnergy}
                onChange={(event) => setExerciseEnergy(event.target.value)}
                disabled={loading || saving || isFuture}
              />
            </label>
            <button className="btn-secondary px-3" type="button" onClick={addExercise} disabled={loading || saving || isFuture}>
              <Plus size={16} />
              添加
            </button>
          </div>

          <div className="mt-4 divide-y divide-line border-y border-line">
            {exercises.length === 0 ? (
              <p className="py-4 text-sm text-muted">尚无运动消耗</p>
            ) : exercises.map((exercise) => (
              <div key={exercise.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm font-semibold text-ink">{exercise.name}</span>
                <div className="flex flex-none items-center gap-2">
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {Math.round(displayEnergy(exercise.kcal, energyUnit))} {energyUnit === "kj" ? "kJ" : "kcal"}
                  </span>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => removeExercise(exercise.id)}
                    disabled={saving}
                    aria-label={`删除 ${exercise.name}`}
                    title="删除运动"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4 bg-panel/45 p-4 sm:p-5">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="metric-label">食物</dt>
              <dd className="mt-1 metric-number text-xl text-ink">{liveActual.foods.length}</dd>
            </div>
            <div>
              <dt className="metric-label">运动</dt>
              <dd className="mt-1 metric-number text-xl text-ink">{exercises.length}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1" type="button" onClick={completeDay} disabled={loading || saving || !ready || isFuture}>
              <Check size={16} />
              {checkin?.completed ? "重新确认" : "完成记录"}
            </button>
            {checkin?.completed ? (
              <button className="icon-button h-11 w-11" type="button" onClick={reopenDay} disabled={saving} aria-label="恢复为记录中" title="恢复为记录中">
                <RotateCcw size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {isFuture ? <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">未来日期不能填写实际记录。</p> : null}
      {message ? <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5" role="status" aria-live="polite">{message}</p> : null}
    </section>
  );
}
