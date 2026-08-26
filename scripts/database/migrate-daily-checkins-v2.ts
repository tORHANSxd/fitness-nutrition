import { isDeepStrictEqual } from "node:util";
import { parseDailyCheckinActual } from "../../lib/storageDocuments";
import { anonymousUserId, applyChanges, batchSize, createAdminClient, createBackupWriter, errorMessage, modeLabel, option } from "./common";

const supabase = createAdminClient();
const pageSize = batchSize();
const columns = "id,user_id,plan_date,actual,vegetable_grams,water_liters,steps,post_workout_carbs,post_workout_protein,sleep_hours,hunger_level,mood_level";

async function main() {
  const backup = await createBackupWriter("migrate-daily-checkins-v2");
  const summary = { mode: modeLabel(), scanned: 0, sourceVersions: {} as Record<string, number>, changed: 0, updated: 0 };
  let offset = 0;
  while (true) {
    let query = supabase.from("daily_checkins").select(columns).order("id").range(offset, offset + pageSize - 1);
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

    for (const row of rows) {
      summary.scanned += 1;
      const source = row.actual && typeof row.actual === "object" && !Array.isArray(row.actual)
        ? String((row.actual as Record<string, unknown>).version ?? "missing")
        : "invalid";
      summary.sourceVersions[source] = (summary.sourceVersions[source] ?? 0) + 1;
      const actual = parseDailyCheckinActual(row.actual, row as Record<string, unknown>, String(row.plan_date));
      if (isDeepStrictEqual(actual, row.actual)) continue;
      summary.changed += 1;
      console.log(JSON.stringify({
        checkinId: String(row.id),
        planDate: String(row.plan_date),
        user: anonymousUserId(String(row.user_id)),
        fromVersion: source,
        toVersion: 2
      }));
      if (applyChanges) {
        await backup?.write({ table: "daily_checkins", row });
        const updated = await supabase
          .from("daily_checkins")
          .update({ actual })
          .eq("id", row.id)
          .eq("user_id", row.user_id);
        if (updated.error) throw updated.error;
        summary.updated += 1;
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
