import { parseLegacyPlannerDraft } from "../../lib/storageDocuments";
import { anonymousUserId, applyChanges, batchSize, createAdminClient, createBackupWriter, errorMessage, modeLabel, option } from "./common";

const supabase = createAdminClient();
const pageSize = batchSize();

async function main() {
  const backup = await createBackupWriter("backfill-planner-drafts");
  const summary = { mode: modeLabel(), scannedProfiles: 0, legacyDrafts: 0, insertedDrafts: 0, existingDrafts: 0 };
  let offset = 0;
  while (true) {
    let query = supabase.from("profiles").select("id,preferences").order("id").range(offset, offset + pageSize - 1);
    const userId = option("user");
    if (userId) query = query.eq("id", userId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) break;
    summary.scannedProfiles += rows.length;
    const ids = rows.map((row) => String(row.id));
    const existing = await supabase.from("planner_drafts").select("user_id").in("user_id", ids);
    if (existing.error) throw existing.error;
    const existingIds = new Set((existing.data ?? []).map((row) => String(row.user_id)));

    for (const row of rows) {
      const preferences = row.preferences;
      const draftValue = preferences && typeof preferences === "object" && !Array.isArray(preferences)
        ? (preferences as Record<string, unknown>).plannerDraft
        : undefined;
      const draft = parseLegacyPlannerDraft(draftValue);
      if (!draft) continue;
      summary.legacyDrafts += 1;
      if (existingIds.has(String(row.id))) {
        summary.existingDrafts += 1;
        continue;
      }
      console.log(JSON.stringify({ user: anonymousUserId(String(row.id)), planDate: draft.profile.planDate }));
      if (applyChanges) {
        const document = {
          user_id: row.id,
          plan_date: draft.profile.planDate,
          profile_snapshot: draft.profile,
          meals: draft.meals,
          schema_version: 2,
          revision: 1
        };
        await backup?.write({ table: "planner_drafts", operation: "insert", row: document });
        const inserted = await supabase.from("planner_drafts").insert(document);
        if (inserted.error) throw inserted.error;
        summary.insertedDrafts += 1;
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
