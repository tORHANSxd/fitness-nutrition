import { createAdminClient, errorMessage, option } from "./common";

const supabase = createAdminClient();
const tables = [
  "profiles", "foods", "food_overrides", "daily_plans", "daily_checkins", "body_logs",
  "planner_templates", "workout_sessions", "planner_drafts", "deload_weeks", "measurement_logs",
  "plan_day_overrides", "plan_instances", "training_logs", "food_import_cache"
];
const countColumn: Record<string, string> = {
  planner_drafts: "user_id",
  deload_weeks: "user_id"
};

async function countTable(table: string) {
  const result = await supabase.from(table).select(countColumn[table] ?? "id", { count: "exact", head: true });
  return result.error ? { error: result.error.code ?? result.error.message } : { count: result.count ?? 0 };
}

async function main() {
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    rowCounts: Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await countTable(table)])))
  };

  const plans = await supabase.from("daily_plans").select("schema_version,meals,integrity_flags");
  if (plans.error) throw plans.error;
  const planVersions: Record<string, number> = {};
  let mealEntries = 0;
  let entriesWithoutSnapshots = 0;
  let plansWithIntegrityFlags = 0;
  for (const plan of plans.data ?? []) {
    const version = String(plan.schema_version ?? "missing");
    planVersions[version] = (planVersions[version] ?? 0) + 1;
    if (Array.isArray(plan.integrity_flags) && plan.integrity_flags.length) plansWithIntegrityFlags += 1;
    if (!Array.isArray(plan.meals)) continue;
    for (const meal of plan.meals) {
      if (!meal || typeof meal !== "object" || !Array.isArray((meal as Record<string, unknown>).entries)) continue;
      for (const entry of (meal as Record<string, unknown>).entries as unknown[]) {
        mealEntries += 1;
        if (!entry || typeof entry !== "object" || !("foodSnapshot" in entry)) entriesWithoutSnapshots += 1;
      }
    }
  }
  report.dailyPlans = { versions: planVersions, mealEntries, entriesWithoutSnapshots, plansWithIntegrityFlags };

  const checkins = await supabase.from("daily_checkins").select("actual");
  if (checkins.error) throw checkins.error;
  const checkinVersions: Record<string, number> = {};
  for (const row of checkins.data ?? []) {
    const version = row.actual && typeof row.actual === "object" && !Array.isArray(row.actual)
      ? String((row.actual as Record<string, unknown>).version ?? "missing")
      : "invalid";
    checkinVersions[version] = (checkinVersions[version] ?? 0) + 1;
  }
  report.dailyCheckins = { versions: checkinVersions };

  const profiles = await supabase.from("profiles").select("preferences");
  if (profiles.error) throw profiles.error;
  const preferenceKeys: Record<string, number> = {};
  for (const row of profiles.data ?? []) {
    if (!row.preferences || typeof row.preferences !== "object" || Array.isArray(row.preferences)) continue;
    for (const key of Object.keys(row.preferences as Record<string, unknown>)) {
      preferenceKeys[key] = (preferenceKeys[key] ?? 0) + 1;
    }
  }
  report.preferenceKeyCounts = preferenceKeys;

  const output = JSON.stringify(report, null, 2);
  const outputPath = option("output");
  if (outputPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outputPath, `${output}\n`, "utf8");
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
