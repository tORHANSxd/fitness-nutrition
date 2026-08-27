import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { daysBetween, isDateKey, monthKey, startOfWeek, toDateKey, toPlainDate } from "@/lib/dateTime";
import { customFoodsFromMeals } from "@/lib/foods";
import { foodFromSnapshot, parseFoodSnapshot } from "@/lib/foodSnapshots";
import { calculateFoodKcalPer100g, getCalorieDeficit } from "@/lib/nutrition";
import type {
  DailyCheckin,
  DailyCheckinActual,
  DailyFoodSnapshot,
  ExerciseEnergyEntry,
  FoodItem,
  HeatmapPlanInput,
  MacroTotals,
  MealPlan,
  NutritionResult,
  UserProfile
} from "@/lib/types";

export type HeatmapMetric = keyof MacroTotals;
export type HeatmapRangePreset = "day" | "week" | "month" | "year" | "custom";
export type HeatmapTileKind = "food" | "exercise" | "basal" | "activity" | "target";

export interface HeatmapDateRange {
  from: string;
  to: string;
}

export interface HeatmapDay {
  date: string;
  completed: boolean;
  actual: DailyCheckinActual;
  target: MacroTotals;
  plannedCalorieDeficitKcal?: number;
  plannedExerciseKcal?: number;
}

export interface HeatmapTileDetail {
  date: string;
  value: number;
}

export interface HeatmapTile {
  id: string;
  kind: HeatmapTileKind;
  label: string;
  value: number;
  share: number;
  details: HeatmapTileDetail[];
}

export interface HeatmapDataset {
  tiles: HeatmapTile[];
  net: number;
  positiveTotal: number;
  negativeTotal: number;
  absoluteTotal: number;
}

export interface HeatmapTileLayout {
  tile: HeatmapTile;
  x: number;
  y: number;
  width: number;
  height: number;
}

const zeroTotals = (): MacroTotals => ({ kcal: 0, carbs: 0, protein: 0, fat: 0 });
const roundValue = (value: number) => Math.round(value * 1000) / 1000;
const normalizeFoodLabel = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ");

export function emptyDailyActual(exercises: ExerciseEnergyEntry[] = []): DailyCheckinActual {
  return { version: 2, foods: [], exercises, bmrKcal: 0, activityKcal: 0 };
}

export function buildDailyActual(
  profile: UserProfile,
  meals: MealPlan[],
  result: Pick<NutritionResult, "bmr">,
  foodsById: ReadonlyMap<string, FoodItem>,
  exercises: ExerciseEnergyEntry[] = []
): DailyCheckinActual {
  const foods = new Map<string, DailyFoodSnapshot>();

  meals.forEach((meal) => {
    meal.entries.forEach((entry) => {
      const food = foodsById.get(entry.foodId);
      if (!food || !Number.isFinite(entry.grams) || entry.grams <= 0) {
        return;
      }
      const factor = entry.grams / 100;
      const contribution: MacroTotals = {
        kcal: calculateFoodKcalPer100g(food) * factor,
        carbs: food.carbsPer100g * factor,
        protein: food.proteinPer100g * factor,
        fat: food.fatPer100g * factor
      };
      const current = foods.get(entry.foodId);
      if (current) {
        current.grams = roundValue(current.grams + entry.grams);
        current.totals = {
          kcal: roundValue(current.totals.kcal + contribution.kcal),
          carbs: roundValue(current.totals.carbs + contribution.carbs),
          protein: roundValue(current.totals.protein + contribution.protein),
          fat: roundValue(current.totals.fat + contribution.fat)
        };
        return;
      }
      foods.set(entry.foodId, {
        foodId: entry.foodId,
        name: food.name,
        grams: roundValue(entry.grams),
        totals: {
          kcal: roundValue(contribution.kcal),
          carbs: roundValue(contribution.carbs),
          protein: roundValue(contribution.protein),
          fat: roundValue(contribution.fat)
        }
      });
    });
  });

  return {
    version: 2,
    foods: [...foods.values()],
    exercises: exercises.map((exercise) => ({ ...exercise })),
    bmrKcal: roundValue(Math.max(0, result.bmr)),
    activityKcal: roundValue(Math.max(0, result.bmr * (profile.activityFactor - 1)))
  };
}

export function buildActualFromSavedPlan(
  plan: HeatmapPlanInput,
  foods: FoodItem[],
  exercises: ExerciseEnergyEntry[] = []
): DailyCheckinActual {
  const snapshotFoods = plan.meals.flatMap((meal) => meal.entries.flatMap((entry) => {
    const snapshot = parseFoodSnapshot(entry.foodSnapshot);
    return snapshot ? [foodFromSnapshot(entry.foodId, snapshot)] : [];
  }));
  const allFoods = [...foods, ...customFoodsFromMeals(plan.meals), ...snapshotFoods];
  return buildDailyActual(plan.profile, plan.meals, plan.result, new Map(allFoods.map((food) => [food.id, food])), exercises);
}

export function buildHeatmapDays({
  plans,
  checkins,
  foods,
  today,
  includeIncomplete
}: {
  plans: HeatmapPlanInput[];
  checkins: DailyCheckin[];
  foods: FoodItem[];
  today: string;
  includeIncomplete: boolean;
}): HeatmapDay[] {
  const plansByDate = new Map(plans.map((plan) => [plan.planDate, plan]));
  const checkinsByDate = new Map(checkins.map((checkin) => [checkin.planDate, checkin]));
  const dates = [...new Set([...plansByDate.keys(), ...checkinsByDate.keys()])].sort();

  return dates.flatMap((date): HeatmapDay[] => {
    const plan = plansByDate.get(date);
    const checkin = checkinsByDate.get(date);
    const completed = checkin?.completed ?? false;
    if (!completed && date !== today && !includeIncomplete) {
      return [];
    }

    const livePlan = date === today ? plan : undefined;
    const actual = livePlan
      ? buildActualFromSavedPlan(livePlan, foods, checkin?.actual.exercises ?? [])
      : completed && checkin
        ? checkin.actual
        : plan
          ? buildActualFromSavedPlan(plan, foods, checkin?.actual.exercises ?? [])
          : checkin?.actual;
    if (!actual) {
      return [];
    }

    return [{
      date,
      completed: completed && date !== today,
      actual,
      target: livePlan ? livePlan.result.dailyTarget : checkin?.target ?? plan?.result.dailyTarget ?? zeroTotals(),
      plannedCalorieDeficitKcal: plan && plan.result.dailyTarget.kcal > 0 ? getCalorieDeficit(plan.profile) : 0,
      plannedExerciseKcal: plan ? Math.max(0, plan.profile.exerciseKcal ?? 0) : 0
    }];
  });
}

export function aggregateHeatmap(days: HeatmapDay[], metric: HeatmapMetric): HeatmapDataset {
  const buckets = new Map<string, Omit<HeatmapTile, "details" | "share"> & { detailsByDate: Map<string, number> }>();
  const foodBucketIdsByName = new Map<string, string>();
  const add = (id: string, kind: HeatmapTileKind, label: string, value: number, date: string) => {
    if (!Number.isFinite(value) || Math.abs(value) < 0.0001) {
      return;
    }
    const current = buckets.get(id) ?? { id, kind, label, value: 0, detailsByDate: new Map<string, number>() };
    current.value += value;
    current.detailsByDate.set(date, (current.detailsByDate.get(date) ?? 0) + value);
    buckets.set(id, current);
  };

  days.forEach((day) => {
    day.actual.foods.forEach((food) => {
      const label = normalizeFoodLabel(food.name);
      const normalizedName = label.toLocaleLowerCase("zh-CN");
      const bucketId = normalizedName
        ? foodBucketIdsByName.get(normalizedName) ?? `food:${food.foodId}`
        : `food:${food.foodId}`;
      if (normalizedName) {
        foodBucketIdsByName.set(normalizedName, bucketId);
      }
      add(bucketId, "food", label || food.name, food.totals[metric], day.date);
    });
    if (metric === "kcal") {
      let hasRecordedExercise = false;
      day.actual.exercises.forEach((exercise) => {
        const normalizedName = exercise.name.trim().toLocaleLowerCase("zh-CN");
        if (normalizedName) {
          hasRecordedExercise = hasRecordedExercise || Math.abs(exercise.kcal) >= 0.0001;
          add(`exercise:${normalizedName}`, "exercise", exercise.name.trim(), -Math.abs(exercise.kcal), day.date);
        }
      });
      if (!day.completed && !hasRecordedExercise) {
        add("exercise:planned", "exercise", "计划运动消耗", -Math.abs(day.plannedExerciseKcal ?? 0), day.date);
      }
      add("basal", "basal", "基础代谢", -Math.abs(day.actual.bmrKcal), day.date);
      add("activity", "activity", "日常活动", -Math.abs(day.actual.activityKcal), day.date);
      add("target:calorie-deficit", "target", "计划热量缺口", -Math.abs(day.plannedCalorieDeficitKcal ?? 0), day.date);
    } else {
      add(`target:${metric}`, "target", "目标需求", -Math.abs(day.target[metric]), day.date);
    }
  });

  const aggregatedTiles = [...buckets.values()]
    .map(({ detailsByDate, ...tile }) => ({
      ...tile,
      value: roundValue(tile.value),
      details: [...detailsByDate.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([date, value]) => ({ date, value: roundValue(value) }))
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value) || left.label.localeCompare(right.label, "zh-CN"));
  const absoluteTotal = aggregatedTiles.reduce((sum, tile) => sum + Math.abs(tile.value), 0);
  const tiles = aggregatedTiles.map((tile) => ({
    ...tile,
    share: absoluteTotal > 0 ? Math.abs(tile.value) / absoluteTotal : 0
  }));
  const positiveTotal = tiles.reduce((sum, tile) => sum + Math.max(0, tile.value), 0);
  const negativeTotal = tiles.reduce((sum, tile) => sum + Math.min(0, tile.value), 0);

  return {
    tiles,
    net: roundValue(positiveTotal + negativeTotal),
    positiveTotal: roundValue(positiveTotal),
    negativeTotal: roundValue(negativeTotal),
    absoluteTotal: roundValue(absoluteTotal)
  };
}

interface HeatmapHierarchyDatum {
  tile?: HeatmapTile;
  magnitude?: number;
  children?: HeatmapHierarchyDatum[];
}

export function layoutHeatmapTiles(tiles: HeatmapTile[], width: number, height: number): HeatmapTileLayout[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || tiles.length === 0) {
    return [];
  }

  const root = hierarchy<HeatmapHierarchyDatum>({
    children: tiles.map((tile) => ({ tile, magnitude: Math.abs(tile.value) }))
  })
    .sum((datum) => datum.magnitude ?? 0)
    .sort((left, right) => (right.value ?? 0) - (left.value ?? 0));

  const laidOutRoot = treemap<HeatmapHierarchyDatum>()
    .tile(treemapSquarify)
    .size([width, height])
    .round(false)
    .paddingInner(0)(root);

  return laidOutRoot.leaves().flatMap((node) => node.data.tile ? [{
    tile: node.data.tile,
    x: node.x0,
    y: node.y0,
    width: node.x1 - node.x0,
    height: node.y1 - node.y0
  }] : []);
}

export function rangeForPreset(preset: Exclude<HeatmapRangePreset, "custom">, today: string, weekStartsOn: number): HeatmapDateRange {
  if (preset === "day") {
    return { from: today, to: today };
  }
  if (preset === "week") {
    return { from: startOfWeek(today, weekStartsOn), to: today };
  }
  if (preset === "month") {
    return { from: monthKey(today), to: today };
  }
  return { from: toDateKey(toPlainDate(today).with({ month: 1, day: 1 })), to: today };
}

export function validateHeatmapRange(range: HeatmapDateRange): string | null {
  if (!isDateKey(range.from) || !isDateKey(range.to)) {
    return "请选择有效的开始和结束日期。";
  }
  const span = daysBetween(range.from, range.to);
  if (span < 0) {
    return "开始日期不能晚于结束日期。";
  }
  // ponytail: 单次限制 366 天；真正需要跨年对比时再增加分页聚合。
  if (span > 365) {
    return "单次最多查看 366 天。";
  }
  return null;
}
