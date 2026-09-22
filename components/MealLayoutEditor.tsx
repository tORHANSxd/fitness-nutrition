"use client";

import { useState } from "react";
import type { PlannerController } from "@/components/usePlanner";
import { configureMealLayout, mealLayoutDraft } from "@/lib/mealLayout";
import { targetForAllocation } from "@/lib/planProtocol";
import { displayEnergy, type EnergyUnit } from "@/lib/preferences";
import type { MacroRatio, MealPlan } from "@/lib/types";

const macroFields = [{ key: "carbs", label: "碳水" }, { key: "protein", label: "蛋白" }, { key: "fat", label: "脂肪" }] as const;
type DraftSlot = { id: string; name: string; weights: Record<keyof MacroRatio, string> };

export function MealLayoutEditor({ controller, energyUnit }: { controller: PlannerController; energyUnit: EnergyUnit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftSlot[]>([]);
  const daily = controller.result.dailyTarget;
  const unit = energyUnit === "kj" ? "kJ" : "kcal";
  const energy = (kcal: number) => Math.round(displayEnergy(kcal, energyUnit));
  const slots = draft.map(slot => ({ ...slot, weights: Object.fromEntries(macroFields.map(({ key }) => [key, slot.weights[key].trim() ? Number(slot.weights[key]) : NaN])) as unknown as MacroRatio }));
  let preview: MealPlan[] = [];
  let error = "";
  if (editing) {
    try { preview = configureMealLayout(controller.meals, slots, daily, new Map(controller.result.mealRecommendations.map(meal => [meal.mealId, meal.target]))); }
    catch (cause) { error = cause instanceof Error ? cause.message : "请检查分餐设置。"; }
  }
  const removedFoods = controller.meals.filter(meal => !draft.some(slot => slot.id === meal.id)).reduce((count, meal) => count + meal.entries.length, 0);

  function open() {
    setDraft(mealLayoutDraft(controller.meals).map(slot => ({ ...slot, weights: { protein: String(slot.weights.protein * 100), carbs: String(slot.weights.carbs * 100), fat: String(slot.weights.fat * 100) } })));
    setEditing(true);
  }

  return <section className="space-y-3 border-b border-line px-4 py-4" aria-label="自定义分餐">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">每天 {controller.meals.length} 餐</h3>
        <p className="text-xs text-muted">每日 {energy(daily.kcal)} {unit} · 碳 {daily.carbs.toFixed(1)}g / 蛋 {daily.protein.toFixed(1)}g / 脂 {daily.fat.toFixed(1)}g</p>
      </div>
      {!editing && <button type="button" className="btn-secondary" onClick={open}>调整餐次</button>}
    </div>
    {editing && <div className="space-y-3">
      <p className="text-xs text-muted">选择每天的餐数，再按需要调整名称和分配比例。</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">每日餐数<select className="field" value={draft.length} onChange={event => {
          const count = Number(event.target.value);
          setDraft(current => Array.from({ length: count }, (_, i) => ({ id: current[i]?.id ?? crypto.randomUUID(), name: current[i]?.name ?? `第 ${i + 1} 餐`, weights: { protein: "1", carbs: "1", fat: "1" } })));
        }}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} 餐</option>)}</select></label>
        <button type="button" className="btn-secondary" onClick={() => setDraft(current => current.map(slot => ({ ...slot, weights: { protein: "1", carbs: "1", fat: "1" } })))}>平均分配</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {draft.map((slot, index) => {
          const meal = preview[index];
          const target = meal?.targetAllocation ? targetForAllocation(daily, meal.targetAllocation) : null;
          return <div key={slot.id} className="min-w-0 space-y-2 rounded-lg border border-line p-3">
            <label className="grid gap-1 text-xs text-muted">第 {index + 1} 餐名称<input className="field w-full" maxLength={80} value={slot.name} onChange={event => setDraft(current => current.map(item => item.id === slot.id ? { ...item, name: event.target.value } : item))} /></label>
            <div className="grid grid-cols-3 gap-2">{macroFields.map(({ key, label }) => <label key={key} className="grid min-w-0 gap-1 text-xs text-muted">{label}份额<input aria-label={`第 ${index + 1} 餐${label}份额`} className="field w-full min-w-0" type="number" min={0} step="any" value={slot.weights[key]} onChange={event => setDraft(current => current.map(item => item.id === slot.id ? { ...item, weights: { ...item.weights, [key]: event.target.value } } : item))} /></label>)}</div>
            {target && <div aria-label={`第 ${index + 1} 餐目标预览`} className="break-words text-sm tabular-nums">
              <p>{energy(target.kcal)} {unit} · 碳 {target.carbs.toFixed(1)}g / 蛋 {target.protein.toFixed(1)}g / 脂 {target.fat.toFixed(1)}g</p>
              <p className="text-xs text-muted">占全天：碳 {(meal.targetAllocation!.carbs * 100).toFixed(1)}% / 蛋 {(meal.targetAllocation!.protein * 100).toFixed(1)}% / 脂 {(meal.targetAllocation!.fat * 100).toFixed(1)}%</p>
            </div>}
          </div>;
        })}
      </div>
      {removedFoods > 0 && <p className="text-sm text-warning">减少餐数后，移除餐次中的 {removedFoods} 项食物将并入最后一餐，克重和食物锁定状态保留。</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">确认后生效，可撤销本次修改。</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={Boolean(error)} onClick={() => { if (controller.updateMealLayout(slots)) setEditing(false); }}>应用分餐设置</button>
        <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>取消修改</button>
      </div>
    </div>}
  </section>;
}
