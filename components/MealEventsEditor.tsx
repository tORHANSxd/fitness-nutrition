"use client";

import { useState } from "react";
import { tutorialAction } from "@/lib/tutorial";
import { FoodPickerDialog } from "@/components/FoodPickerDialog";
import type { PlannerController } from "@/components/usePlanner";
import { actualEntryTotals, confirmMealEvent, parseMealEvent } from "@/lib/actualIntake";
import { foodSnapshotFromFood } from "@/lib/foodSnapshots";
import { localInstant, formatLocalClock } from "@/lib/eatingSchedule";
import { addDays, formatInstant } from "@/lib/dateTime";
import { displayEnergy, type EnergyUnit, type HourCycle } from "@/lib/preferences";
import type { DailyCheckinActualV3, MealEvent } from "@/lib/types";

export function MealEventsEditor({ controller, actual, date, timeZone, hourCycle = "h23", energyUnit, disabled, onSave }: { controller: PlannerController; actual: DailyCheckinActualV3; date: string; timeZone: string; hourCycle?: HourCycle; energyUnit: EnergyUnit; disabled: boolean; onSave: (actual: DailyCheckinActualV3) => Promise<boolean> }) {
  const [preview, setPreview] = useState<MealEvent | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [nextDay, setNextDay] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [grams, setGrams] = useState(100);
  const [error, setError] = useState("");
  const [habits, setHabits] = useState(actual.habits ?? {});
  const [recovery, setRecovery] = useState(actual.recovery ?? {});
  const energyLabel = energyUnit === "kj" ? "kJ" : "kcal";

  async function savePreview() {
    if (!preview) return;
    try {
      const event = parseMealEvent({ ...preview, startedAt: start ? localInstant(date, start, timeZone).toString() : undefined, endedAt: end ? localInstant(addDays(date, nextDay ? 1 : 0), end, timeZone).toString() : undefined });
      if (!event.actualFoodEntries.length && !event.note?.trim()) throw new Error("未填写食物时，请填写事件名称或简短说明。");
      if (await onSave({ ...actual, intakeComplete: false, mealEvents: [...actual.mealEvents.filter((e) => e.id !== event.id), event] })) { setPreview(null); tutorialAction("intake-saved"); }
    } catch (e) { setError(e instanceof Error ? e.message : "进食事件无效。"); }
  }

  return <div className="space-y-4 border-b border-line p-4">
    <div className="flex flex-wrap gap-2" data-tour="intake-start">{controller.meals.map((meal) => <button key={meal.id} type="button" className="btn-secondary" disabled={disabled || !meal.entries.length} onClick={() => {
      try { setPreview(confirmMealEvent(meal, controller.foodsById, { id: crypto.randomUUID(), timeZone })); setStart(""); setEnd(""); setNextDay(false); setError(""); tutorialAction("intake-opened"); } catch (e) { setError(e instanceof Error ? e.message : "无法复制该餐。"); }
    }}>{meal.name}按计划吃了</button>)}
    <button type="button" className="btn-primary" disabled={disabled} onClick={() => { setPreview({ id: crypto.randomUUID(), timeZone, actualFoodEntries: [], entryMethod: "measured", containsCalories: true }); setStart(""); setEnd(""); setNextDay(false); setError(""); tutorialAction("intake-opened"); }}>记录食物或饮料</button></div>
    {actual.legacyActual && <p className="text-sm text-muted">已保留原有全天记录，请勿重复添加其中的食物。</p>}
    {preview && <div className="space-y-3 rounded border border-line p-3" role="region" aria-label="实际进食确认预览" data-tour="intake-editor">
      <h4 className="font-semibold">确认实际分量与时间</h4>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">实际开始（可空）<input type="time" className="field mt-1 w-full" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="text-sm">实际结束（可空）<input type="time" className="field mt-1 w-full" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nextDay} onChange={(e) => setNextDay(e.target.checked)} />结束在次日</label>
      </div>
      <p className="text-xs text-muted">{start ? formatLocalClock(start, hourCycle) : "开始未知"} — {end ? formatLocalClock(end, hourCycle) : "结束未知"} · {timeZone}</p>
      {preview.actualFoodEntries.map((entry) => <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_110px_130px_auto]" key={entry.id}>
        <span className="break-words text-sm">{entry.foodSnapshot.name}</span>
        <label className="text-xs">食用重量 g<input type="number" min="0" step="any" className="field w-full" value={Number.isFinite(entry.grams) ? entry.grams : ""} onChange={(e) => setPreview({ ...preview, actualFoodEntries: preview.actualFoodEntries.map((f) => f.id === entry.id ? { ...f, grams: e.target.valueAsNumber } : f) })} /></label>
        <label className="text-xs">热量计算<select className="field w-full" value={entry.energyBasis} onChange={(e) => setPreview({ ...preview, actualFoodEntries: preview.actualFoodEntries.map((f) => f.id === entry.id ? { ...f, energyBasis: e.target.value as "macros" | "label" } : f) })}><option value="macros">按营养素计算</option><option value="label">按食品标示</option></select></label>
        <button type="button" className="btn-secondary" aria-label={`移除实际食品 ${entry.foodSnapshot.name}`} onClick={() => setPreview({ ...preview, actualFoodEntries: preview.actualFoodEntries.filter((f) => f.id !== entry.id) })}>移除</button>
      </div>)}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
        <button type="button" className="btn-secondary" onClick={() => setPickerOpen(true)}>添加实际食物</button>
        <input className="field" type="number" min="0" step="any" aria-label="额外食品克重" value={grams} onChange={(e) => setGrams(e.target.valueAsNumber)} />
        <span className="self-center text-xs text-muted">可食用重量（g）</span>
      </div>
      <label className="block text-sm">记录方式<select className="field mt-1 w-full" value={preview.entryMethod} onChange={(e) => setPreview({ ...preview, entryMethod: e.target.value as MealEvent["entryMethod"] })}><option value="measured">称量</option><option value="estimated">估算</option><option value="confirmed_from_plan">按计划确认</option></select></label>
      {!preview.actualFoodEntries.length && <label className="flex gap-2 text-sm"><input type="checkbox" checked={preview.containsCalories} onChange={(e) => setPreview({ ...preview, containsCalories: e.target.checked })} />含热量（量未知时仍保留事件）</label>}
      <label className="block text-sm">简短备注<input className="field mt-1 w-full" maxLength={500} value={preview.note ?? ""} onChange={(e) => setPreview({ ...preview, note: e.target.value })} /></label>
      <div className="flex gap-2"><button type="button" className="btn-primary" disabled={disabled} onClick={() => void savePreview()}>保存饮食记录</button><button type="button" className="btn-secondary" onClick={() => setPreview(null)}>取消</button></div>
    </div>}
    <ul className="divide-y divide-line">{actual.mealEvents.map((event) => <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
      <span>{event.actualFoodEntries.map((e) => `${e.foodSnapshot.name} ${e.grams}g`).join("、") || event.note || "未填写食物"}<br /><span className="text-xs text-muted">{event.endedAt ? formatInstant(event.endedAt, "zh-CN", event.timeZone, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle }) : "未记录时间"} · {event.actualFoodEntries.length ? `${Math.round(displayEnergy(event.actualFoodEntries.reduce((sum, e) => sum + actualEntryTotals(e).kcal, 0), energyUnit))} ${energyLabel}` : event.containsCalories ? "热量待补充" : "不含热量"}</span></span>
      <button className="btn-secondary" type="button" disabled={disabled} onClick={() => void onSave({ ...actual, intakeComplete: false, mealEvents: actual.mealEvents.filter((e) => e.id !== event.id) })}>撤销该事件</button>
    </li>)}</ul>
    <details><summary className="cursor-pointer py-2">睡眠、恢复与执行打卡（空白表示未知）</summary>
      <div className="grid gap-3 sm:grid-cols-3">{([['sleepHours','睡眠小时',24],['steps','步数',100000],['hungerLevel','饥饿 0—5',5],['waterLiters','饮水 L',20]] as const).map(([key,label,max]) => <label className="text-sm" key={key}>{label}<input className="field mt-1 w-full" type="number" min="0" max={max} step="any" value={habits[key] ?? ""} onChange={(e) => setHabits({ ...habits, [key]: e.target.value === "" ? undefined : e.target.valueAsNumber })} /></label>)}
        <label className="text-sm">疲劳 0—5<input className="field mt-1 w-full" type="number" min="0" max="5" value={recovery.fatigue ?? ""} onChange={(e) => setRecovery({ ...recovery, fatigue: e.target.value === "" ? undefined : e.target.valueAsNumber })} /></label>
        <label className="text-sm">足部不适 0—10<input className="field mt-1 w-full" type="number" min="0" max="10" value={recovery.footPain ?? ""} onChange={(e) => setRecovery({ ...recovery, footPain: e.target.value === "" ? undefined : e.target.valueAsNumber })} /></label>
        <label className="text-sm">训练耐受<select className="field mt-1 w-full" value={recovery.trainingTolerance ?? ""} onChange={(e) => setRecovery({ ...recovery, trainingTolerance: e.target.value ? e.target.value as "good" | "limited" : undefined })}><option value="">未知</option><option value="good">正常</option><option value="limited">受限</option></select></label>
        <label className="text-sm">持续不适<select className="field mt-1 w-full" value={recovery.persistentSymptoms == null ? "" : String(recovery.persistentSymptoms)} onChange={(e) => setRecovery({ ...recovery, persistentSymptoms: e.target.value === "" ? undefined : e.target.value === "true" })}><option value="">未知</option><option value="false">无</option><option value="true">有</option></select></label>
      </div>
      <button type="button" className="btn-secondary mt-3" disabled={disabled} onClick={() => void onSave({ ...actual, habits: { ...actual.habits, ...habits }, recovery })}>保存恢复打卡</button>
    </details>
    <FoodPickerDialog open={pickerOpen} title="选择实际食物" foods={[...controller.foodsById.values()]} energyUnit={energyUnit} onClose={() => setPickerOpen(false)} onSelect={foodId => { const food = controller.foodsById.get(foodId); if (food && preview && Number.isFinite(grams) && grams >= 0) setPreview({ ...preview, actualFoodEntries: [...preview.actualFoodEntries, { id: crypto.randomUUID(), foodId, foodSnapshot: foodSnapshotFromFood(food), grams, energyBasis: "macros" }] }); else setError("请填写有效的食用重量。"); }}/>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}
