import { Temporal } from "@js-temporal/polyfill";
import { edibleGrams } from "@/lib/foodWeights";
import { foodSnapshotFromFood, parseFoodSnapshot } from "@/lib/foodSnapshots";
import { assertDocument, boundedNumber, parsePlanProtocol, record, validZone } from "@/lib/planProtocol";
import { addTotals, zeroTotals } from "@/lib/nutrition";
import type { ActualFoodEntry, DailyCheckinActual, DailyCheckinActualV2, DailyCheckinActualV3, DailyFoodSnapshot, FoodItem, MacroTotals, MealEvent, MealPlan } from "@/lib/types";

export function actualEntryTotals(entry: ActualFoodEntry): MacroTotals {
  const f = entry.foodSnapshot;
  const factor = entry.grams / 100;
  return { kcal: (entry.energyBasis === "label" ? f.kcalPer100g : f.proteinPer100g * 4 + f.carbsPer100g * 4 + f.fatPer100g * 9) * factor, protein: f.proteinPer100g * factor, carbs: f.carbsPer100g * factor, fat: f.fatPer100g * factor };
}

export function actualTotals(actual: DailyCheckinActual): MacroTotals {
  if (actual.version === 2) return actual.totalsSnapshot ?? actual.foods.reduce((total, food) => addTotals(total, food.totals), { ...zeroTotals });
  return actual.mealEvents.flatMap((event) => event.actualFoodEntries).reduce((total, entry) => addTotals(total, actualEntryTotals(entry)), actual.legacyActual ? actualTotals(actual.legacyActual) : { ...zeroTotals });
}

export function actualCoverageKnown(actual: DailyCheckinActual): boolean {
  if (actual.version === 2) return actual.foods.length > 0 || actual.totalsSnapshot != null;
  return actual.intakeComplete && (actual.mealEvents.length > 0 || (actual.legacyActual != null && actualCoverageKnown(actual.legacyActual))) && !actual.mealEvents.some((event) => event.containsCalories && event.actualFoodEntries.length === 0);
}

export function deriveActualFoods(events: MealEvent[], legacy?: DailyCheckinActualV2): DailyFoodSnapshot[] {
  const result = structuredClone(legacy?.foods ?? []);
  for (const event of events) for (const entry of event.actualFoodEntries) {
    // 同食物的不同版本快照先分别计算，汇总输出不可反向修改实际。
    result.push({ foodId: entry.foodId, name: entry.foodSnapshot.name, grams: entry.grams, totals: actualEntryTotals(entry) });
  }
  return result;
}

export function emptyActualV3(legacy?: DailyCheckinActualV2): DailyCheckinActualV3 {
  return { version: 3, mealEvents: [], foods: structuredClone(legacy?.foods ?? []), exercises: structuredClone(legacy?.exercises ?? []), bmrKcal: legacy?.bmrKcal ?? 0, activityKcal: legacy?.activityKcal ?? 0, intakeComplete: false, ...(legacy ? { legacyActual: structuredClone(legacy), habits: structuredClone(legacy.habits) } : {}) };
}

export function parseMealEvent(raw: unknown): MealEvent {
  const e = record(raw);
  if (typeof e.id !== "string" || !e.id || e.id.length > 100 || !Array.isArray(e.actualFoodEntries) || e.actualFoodEntries.length > 100 || !["measured", "estimated", "confirmed_from_plan"].includes(String(e.entryMethod)) || typeof e.containsCalories !== "boolean") throw new Error("实际进食事件格式无效。");
  const actualFoodEntries: ActualFoodEntry[] = e.actualFoodEntries.map((rawEntry) => {
    const item = record(rawEntry);
    const snapshot = parseFoodSnapshot(item.foodSnapshot);
    if (typeof item.id !== "string" || !item.id || typeof item.foodId !== "string" || !snapshot || !["macros", "label"].includes(String(item.energyBasis))) throw new Error("实际食品快照无效。");
    return { ...item, id: item.id, foodId: item.foodId, foodSnapshot: snapshot, grams: boundedNumber(item.grams, 0, 1000000, "实际克重"), energyBasis: item.energyBasis as "macros" | "label" };
  });
  if (new Set(actualFoodEntries.map((entry) => entry.id)).size !== actualFoodEntries.length) throw new Error("实际食品条目标识重复。");
  const startedAt = e.startedAt == null ? undefined : Temporal.Instant.from(String(e.startedAt)).toString();
  const endedAt = e.endedAt == null ? undefined : Temporal.Instant.from(String(e.endedAt)).toString();
  if (startedAt && endedAt && Temporal.Instant.compare(Temporal.Instant.from(startedAt), Temporal.Instant.from(endedAt)) > 0) throw new Error("实际结束时间早于开始时间。");
  if (e.note != null && (typeof e.note !== "string" || e.note.length > 500)) throw new Error("进食备注最长 500 字。");
  if (e.linkedPlanMealId != null && typeof e.linkedPlanMealId !== "string") throw new Error("关联餐次无效。");
  const containsCalories = actualFoodEntries.length ? actualFoodEntries.some((entry) => actualEntryTotals(entry).kcal > 0 || (entry.grams > 0 && entry.foodSnapshot.proteinPer100g + entry.foodSnapshot.carbsPer100g + entry.foodSnapshot.fatPer100g > 0)) : e.containsCalories;
  return { ...e, id: e.id, timeZone: validZone(e.timeZone), actualFoodEntries, entryMethod: e.entryMethod as MealEvent["entryMethod"], containsCalories, ...(startedAt ? { startedAt } : {}), ...(endedAt ? { endedAt } : {}) };
}

export function normalizeActualV3(raw: unknown, legacy?: DailyCheckinActualV2): DailyCheckinActualV3 {
  assertDocument(raw);
  const item = record(raw);
  if (item.version !== 3 || !Array.isArray(item.mealEvents) || item.mealEvents.length > 100 || typeof item.intakeComplete !== "boolean" || !Array.isArray(item.exercises)) throw new Error("实际 V3 文档无效。");
  const mealEvents = item.mealEvents.map(parseMealEvent);
  const targetProtocolSnapshot = item.targetProtocolSnapshot == null ? undefined : parsePlanProtocol(item.targetProtocolSnapshot);
  if (new Set(mealEvents.map((event) => event.id)).size !== mealEvents.length) throw new Error("实际事件标识重复。");
  const exercises = item.exercises.map((rawExercise) => {
    const e = record(rawExercise);
    if (typeof e.id !== "string" || !e.id || e.id.length > 100 || typeof e.name !== "string" || !e.name || e.name.length > 80) throw new Error("运动消耗记录无效。");
    return { id: e.id, name: e.name, kcal: boundedNumber(e.kcal, 0, 10000, "估计运动消耗") };
  });
  if (new Set(exercises.map(e => e.id)).size !== exercises.length) throw new Error("运动记录标识重复。");
  const habits: NonNullable<DailyCheckinActual["habits"]> = {};
  if (item.habits != null) {
    const h = record(item.habits);
    for (const key of ["vegetableGrams", "waterLiters", "steps", "postWorkoutCarbs", "postWorkoutProtein", "sleepHours", "hungerLevel", "moodLevel"] as const) {
      if (h[key] != null) habits[key] = boundedNumber(h[key], 0, key === "sleepHours" ? 24 : key === "hungerLevel" || key === "moodLevel" ? 5 : 100000, key);
    }
  }
  let recovery: DailyCheckinActualV3["recovery"];
  if (item.recovery != null) {
    const r = record(item.recovery); recovery = {};
    if (r.fatigue != null) recovery.fatigue = boundedNumber(r.fatigue, 0, 5, "疲劳");
    if (r.footPain != null) recovery.footPain = boundedNumber(r.footPain, 0, 10, "足部不适");
    if (r.trainingTolerance != null) {
      if (r.trainingTolerance !== "good" && r.trainingTolerance !== "limited") throw new Error("训练耐受标记无效。");
      recovery.trainingTolerance = r.trainingTolerance;
    }
    if (r.persistentSymptoms != null) {
      if (typeof r.persistentSymptoms !== "boolean") throw new Error("持续不适标记无效。");
      recovery.persistentSymptoms = r.persistentSymptoms;
    }
  }
  return { ...item, version: 3, mealEvents, ...(targetProtocolSnapshot ? { targetProtocolSnapshot } : {}), foods: deriveActualFoods(mealEvents, legacy), exercises, bmrKcal: boundedNumber(item.bmrKcal, 0, 10000, "估计基础代谢"), activityKcal: boundedNumber(item.activityKcal, 0, 10000, "估计活动消耗"), intakeComplete: item.intakeComplete, ...(legacy ? { legacyActual: legacy } : {}), ...(Object.keys(habits).length ? { habits } : {}), ...(recovery ? { recovery } : {}) };
}

export function confirmMealEvent(meal: MealPlan, foods: ReadonlyMap<string, FoodItem>, input: { id: string; timeZone: string; startedAt?: string; endedAt?: string }): MealEvent {
  if (!meal.entries.length) throw new Error("该餐尚无食品，不能确认成实际摄入。");
  return parseMealEvent({ ...input, linkedPlanMealId: meal.id, entryMethod: "confirmed_from_plan", containsCalories: true,
    actualFoodEntries: meal.entries.map((entry) => {
      const food = foods.get(entry.foodId);
      const snapshot = food ? foodSnapshotFromFood(food) : parseFoodSnapshot(entry.foodSnapshot);
      if (!snapshot) throw new Error("该餐有缺失食品，请补全后确认。");
      return { id: entry.id, foodId: entry.foodId, foodSnapshot: structuredClone(snapshot), grams: edibleGrams(entry.grams, entry), energyBasis: "macros" };
    }),
  });
}
