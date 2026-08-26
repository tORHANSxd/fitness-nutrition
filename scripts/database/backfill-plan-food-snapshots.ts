import { builtinFoods, createCustomFood } from "../../lib/foods";
import { foodSnapshotFromFood, parseFoodSnapshot } from "../../lib/foodSnapshots";
import { mapFoodRow } from "../../lib/supabase";
import { foodCategories, type CustomFoodDraft, type FoodItem } from "../../lib/types";
import { anonymousUserId, applyChanges, batchSize, createAdminClient, createBackupWriter, errorMessage, modeLabel, option } from "./common";

const foodColumns = "id,user_id,name,category,kcal_per_100g,fat_per_100g,carbs_per_100g,protein_per_100g,weight_basis,cooked_raw_ratio,archived_at";
const supabase = createAdminClient();
const pageSize = batchSize();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function embeddedCustomFood(entry: Record<string, unknown>, foodId: string): FoodItem | null {
  const value = entry.customFood;
  if (!isRecord(value)
    || typeof value.name !== "string"
    || !(foodCategories as readonly unknown[]).includes(value.category)
    || ![value.carbsPer100g, value.proteinPer100g, value.fatPer100g].every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0)) {
    return null;
  }
  return createCustomFood(value as unknown as CustomFoodDraft, foodId);
}

async function loadFoods(userIds: string[]) {
  const [publicResult, userResult] = await Promise.all([
    supabase.from("foods").select(foodColumns).is("user_id", null),
    userIds.length
      ? supabase.from("foods").select(foodColumns).in("user_id", userIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (publicResult.error) throw publicResult.error;
  if (userResult.error) throw userResult.error;
  return new Map<string, FoodItem>([
    ...builtinFoods.map((food) => [food.id, food] as const),
    ...[...(publicResult.data ?? []), ...(userResult.data ?? [])].map((row) => {
      const food = mapFoodRow(row as Record<string, unknown>);
      return [food.id, food] as const;
    })
  ]);
}

function patchMeals(value: unknown, foodsById: ReadonlyMap<string, FoodItem>) {
  if (!Array.isArray(value)) throw new Error("遇到未知 meals schema，已停止回填。");
  let changed = false;
  const unresolved = new Set<string>();
  let unresolvedCount = 0;
  const meals = value.map((meal) => {
    if (!isRecord(meal) || !Array.isArray(meal.entries)) throw new Error("遇到未知 meal schema，已停止回填。");
    return {
      ...meal,
      entries: meal.entries.map((rawEntry) => {
        if (!isRecord(rawEntry) || typeof rawEntry.foodId !== "string" || !rawEntry.foodId) {
          throw new Error("遇到未知 meal entry schema，已停止回填。");
        }
        if (parseFoodSnapshot(rawEntry.foodSnapshot)) return rawEntry;
        const food = foodsById.get(rawEntry.foodId) ?? embeddedCustomFood(rawEntry, rawEntry.foodId);
        if (!food) {
          unresolved.add(rawEntry.foodId);
          unresolvedCount += 1;
          return rawEntry;
        }
        changed = true;
        return { ...rawEntry, foodSnapshot: foodSnapshotFromFood(food) };
      })
    };
  });
  return { changed, meals, unresolved, unresolvedCount };
}

async function main() {
  const backup = await createBackupWriter("backfill-plan-food-snapshots");
  const summary = { mode: modeLabel(), scannedPlans: 0, changedPlans: 0, updatedPlans: 0, unresolvedEntries: 0 };
  let offset = 0;
  while (true) {
    let query = supabase
      .from("daily_plans")
      .select("id,user_id,plan_date,meals,schema_version,integrity_flags")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    const userId = option("user");
    const from = option("from");
    const to = option("to");
    if (userId) query = query.eq("user_id", userId);
    if (from) query = query.gte("plan_date", from);
    if (to) query = query.lte("plan_date", to);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) break;
    const foodsById = await loadFoods([...new Set(rows.map((row) => String(row.user_id)))]);

    for (const row of rows) {
      summary.scannedPlans += 1;
      const schemaVersion = Number(row.schema_version ?? 1);
      if (schemaVersion !== 1 && schemaVersion !== 2) {
        throw new Error(`计划 ${String(row.id)} 使用未知 schema_version=${schemaVersion}，已停止回填。`);
      }
      const patched = patchMeals(row.meals, foodsById);
      const priorFlags = Array.isArray(row.integrity_flags)
        ? row.integrity_flags.filter((flag): flag is string => typeof flag === "string" && !flag.startsWith("unresolved_food_ref:"))
        : [];
      const integrityFlags = [...priorFlags, ...[...patched.unresolved].sort().map((id) => `unresolved_food_ref:${id}`)];
      const flagsChanged = JSON.stringify(integrityFlags) !== JSON.stringify(row.integrity_flags ?? []);
      if (!patched.changed && !flagsChanged) continue;
      summary.changedPlans += 1;
      summary.unresolvedEntries += patched.unresolvedCount;
      console.log(JSON.stringify({
        planId: String(row.id),
        planDate: String(row.plan_date),
        user: anonymousUserId(String(row.user_id)),
        unresolved: patched.unresolvedCount
      }));
      if (applyChanges) {
        await backup?.write({
          table: "daily_plans",
          id: row.id,
          user_id: row.user_id,
          plan_date: row.plan_date,
          meals: row.meals,
          integrity_flags: row.integrity_flags
        });
        const result = await supabase
          .from("daily_plans")
          .update({ meals: patched.meals, integrity_flags: integrityFlags })
          .eq("id", row.id)
          .eq("user_id", row.user_id);
        if (result.error) throw result.error;
        summary.updatedPlans += 1;
      }
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  await backup?.close();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
