import { assertMealAllocations, targetForAllocation } from "@/lib/planProtocol";
import type { MacroRatio, MacroTotals, MealPlan } from "@/lib/types";

export interface MealLayoutSlot {
  id: string;
  name: string;
  /** Relative weights, normalized independently for protein, carbs and fat. */
  weights: MacroRatio;
}

const macros = ["protein", "carbs", "fat"] as const;

export function mealLayoutDraft(meals: MealPlan[]): MealLayoutSlot[] {
  return meals.map(meal => ({ id: meal.id, name: meal.name, weights: { ...(meal.targetAllocation ?? { protein: meal.ratio, carbs: meal.ratio, fat: meal.ratio }) } }));
}

/** Only the allocation is stored; gram and energy targets always come from the current daily target. */
export function allocateMealLayout(slots: MealLayoutSlot[], daily: MacroTotals) {
  if (slots.length < 1 || slots.length > 12) throw new Error("每天可设置 1–12 餐。");
  const sums = { protein: 0, carbs: 0, fat: 0 };
  for (const slot of slots) for (const key of macros) {
    const weight = slot.weights[key];
    if (!Number.isFinite(weight) || weight < 0) throw new Error("分配份额必须为有限的非负数。");
    sums[key] += weight;
  }
  if (macros.some(key => !Number.isFinite(sums[key]) || sums[key] <= 0)) throw new Error("碳水、蛋白、脂肪各自的份额合计必须大于 0。");
  const energy = daily.protein * 4 + daily.carbs * 4 + daily.fat * 9;
  const layout = slots.map(slot => {
    const targetAllocation = { protein: slot.weights.protein / sums.protein, carbs: slot.weights.carbs / sums.carbs, fat: slot.weights.fat / sums.fat };
    return { id: slot.id, name: slot.name.trim(), targetAllocation, ratio: energy > 0 ? targetForAllocation(daily, targetAllocation).kcal / energy : 1 / slots.length };
  });
  assertMealAllocations(layout);
  return layout;
}

/** Resize without losing foods, grams, snapshots, limits or locks. Removed foods move to the last meal. */
export function configureMealLayout(current: MealPlan[], slots: MealLayoutSlot[], daily: MacroTotals, currentTargets?: Map<string, MacroTotals>): MealPlan[] {
  const layout = allocateMealLayout(slots, daily);
  const retained = new Set(layout.map(slot => slot.id));
  const removed = current.filter(meal => !retained.has(meal.id));
  if (removed.some(meal => meal.locked)) throw new Error("请先解锁要移除的餐次。");
  const movedEntries = removed.flatMap(meal => meal.entries);
  const next = layout.map(slot => {
    const old = current.find(meal => meal.id === slot.id);
    if (old?.locked) {
      const before = currentTargets?.get(old.id) ?? targetForAllocation(daily, old.targetAllocation ?? { protein: old.ratio, carbs: old.ratio, fat: old.ratio });
      const after = targetForAllocation(daily, slot.targetAllocation);
      if (macros.some(key => Math.abs(before[key] - after[key]) > 0.000001)) throw new Error(`请先解锁「${old.name}」，再修改其营养分配。`);
    }
    return { ...(old ?? { locked: false, entries: [] }), ...slot };
  });
  const last = next[next.length - 1];
  if (movedEntries.length && last.locked) throw new Error("最后一餐已锁定，无法接收移除餐次的食物，请先解锁。");
  if (movedEntries.length) last.entries = [...last.entries, ...movedEntries];
  return next;
}
