import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const localUrl = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const localAnonKey = process.env.SUPABASE_TEST_ANON_KEY
  ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(localUrl)) {
  throw new Error("集成测试只允许连接本地 Supabase。");
}

let userA: SupabaseClient;
let userB: SupabaseClient;
let anonymous: SupabaseClient;
let userAId: string;
let userBId: string;

async function createTestClient(label: string) {
  const client = createClient(localUrl, localAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nonce = `${Date.now()}-${crypto.randomUUID()}`;
  const { data, error } = await client.auth.signUp({
    email: `nutritrain-${label}-${nonce}@example.test`,
    password: "Test-only-123!",
  });
  if (error) throw error;
  if (!data.user) throw new Error("本地测试用户创建失败。");
  return { client, userId: data.user.id };
}

function foodRow(name: string) {
  return {
    user_id: userAId,
    name,
    category: "主食",
    kcal_per_100g: 100,
    fat_per_100g: 1,
    carbs_per_100g: 20,
    protein_per_100g: 3,
    weight_basis: "none",
    cooked_raw_ratio: null,
    source: "user",
  };
}

beforeAll(async () => {
  const accountA = await createTestClient("a");
  const accountB = await createTestClient("b");
  userA = accountA.client;
  userB = accountB.client;
  anonymous = createClient(localUrl, localAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  userAId = accountA.userId;
  userBId = accountB.userId;
});

describe.sequential("Supabase storage safety", () => {
  it("blocks anon, forged ownership, private credentials, and physical food deletes", async () => {
    const anonRead = await anonymous.from("daily_plans").select("id");
    expect(anonRead.error).not.toBeNull();

    const forged = await userA.from("foods").insert({ ...foodRow("伪造归属"), user_id: userBId });
    expect(forged.error).not.toBeNull();

    const privateRead = await userA.schema("private").from("health_sync_credentials").select("user_id");
    expect(privateRead.error).not.toBeNull();

    const { data: inserted, error: insertError } = await userA.from("foods").insert(foodRow("不可硬删")).select("id").single();
    expect(insertError).toBeNull();
    const deleted = await userA.from("foods").delete().eq("id", inserted!.id);
    expect(deleted.error).not.toBeNull();
    const retained = await userA.from("foods").select("id").eq("id", inserted!.id);
    expect(retained.data).toEqual([{ id: inserted!.id }]);
  });

  it("isolates user rows with RLS and lets updated_at be trigger-owned", async () => {
    const { data: inserted, error: insertError } = await userA
      .from("foods")
      .insert(foodRow("RLS 食物"))
      .select("id,updated_at")
      .single();
    expect(insertError).toBeNull();

    const { data: leaked, error: readError } = await userB
      .from("foods")
      .select("id")
      .eq("id", inserted!.id);
    expect(readError).toBeNull();
    expect(leaked).toEqual([]);

    const { data: updated, error: updateError } = await userA
      .from("foods")
      .update({ name: "RLS 食物已更新" })
      .eq("id", inserted!.id)
      .select("updated_at")
      .single();
    expect(updateError).toBeNull();
    expect(Date.parse(updated!.updated_at)).toBeGreaterThanOrEqual(Date.parse(inserted!.updated_at));

    const bodyLog = await userA
      .from("body_logs")
      .upsert({ user_id: userAId, plan_date: "2026-08-26", weight_kg: 80.5, body_fat_pct: 18.25 })
      .select("weight_kg,body_fat_pct")
      .single();
    expect(bodyLog.error).toBeNull();
    expect(bodyLog.data).toMatchObject({ weight_kg: 80.5, body_fat_pct: 18.25 });

    const leakedBodyLog = await userB
      .from("body_logs")
      .select("plan_date,body_fat_pct")
      .eq("plan_date", "2026-08-26");
    expect(leakedBodyLog.error).toBeNull();
    expect(leakedBodyLog.data).toEqual([]);
  });

  it("detects stale planner draft revisions without overwriting", async () => {
    const profile = { planDate: "2026-08-26", sex: "male", age: 30, heightCm: 180, weightKg: 80, activityFactor: 1.2, trainingTime: "rest" };
    const first = await userA.rpc("save_planner_draft_v2", {
      p_plan_date: profile.planDate,
      p_profile_snapshot: profile,
      p_meals: [],
      p_schema_version: 2,
      p_expected_revision: null,
      p_force: false,
    });
    expect(first.error).toBeNull();
    expect(first.data?.[0].revision).toBe(1);

    const second = await userA.rpc("save_planner_draft_v2", {
      p_plan_date: profile.planDate,
      p_profile_snapshot: { ...profile, weightKg: 81 },
      p_meals: [],
      p_schema_version: 2,
      p_expected_revision: 1,
      p_force: false,
    });
    expect(second.error).toBeNull();
    expect(second.data?.[0].revision).toBe(2);

    const stale = await userA.rpc("save_planner_draft_v2", {
      p_plan_date: profile.planDate,
      p_profile_snapshot: { ...profile, weightKg: 60 },
      p_meals: [],
      p_schema_version: 2,
      p_expected_revision: 1,
      p_force: false,
    });
    expect(stale.error?.message).toContain("draft_conflict");
    const { data: current } = await userA.from("planner_drafts").select("revision,profile_snapshot").single();
    expect(current).toMatchObject({ revision: 2, profile_snapshot: { weightKg: 81 } });
  });

  it("updates separate deload weeks without whole-array overwrites", async () => {
    const writes = await Promise.all([
      userA.rpc("set_deload_week_v1", { p_week_start: "2026-08-24", p_enabled: true }),
      userA.rpc("set_deload_week_v1", { p_week_start: "2026-08-31", p_enabled: true }),
    ]);
    expect(writes.every((write) => write.error == null)).toBe(true);
    const { data, error } = await userA.from("deload_weeks").select("week_start").order("week_start");
    expect(error).toBeNull();
    expect(data?.map((row) => row.week_start)).toEqual(["2026-08-24", "2026-08-31"]);
  });

  it("keeps template create and delete scoped to one row", async () => {
    const rows = [
      { user_id: userAId, template_type: "meal", name: "模板 A", payload: { version: 3, foods: [] }, schema_version: 3, fingerprint: "a" },
      { user_id: userAId, template_type: "meal", name: "模板 B", payload: { version: 3, foods: [] }, schema_version: 3, fingerprint: "b" },
    ];
    const { data: inserted, error: insertError } = await userA.from("planner_templates").insert(rows).select("id,name");
    expect(insertError).toBeNull();
    const firstId = inserted?.find((row) => row.name === "模板 A")?.id;
    const { error: deleteError } = await userA.from("planner_templates").delete().eq("id", firstId);
    expect(deleteError).toBeNull();
    const { data: remaining } = await userA.from("planner_templates").select("name").in("name", ["模板 A", "模板 B"]);
    expect(remaining).toEqual([{ name: "模板 B" }]);
  });

  it("completes a plan and check-in atomically", async () => {
    const date = "2026-08-25";
    const profile = { planDate: date };
    const actual = { version: 2, foods: [], exercises: [], bmrKcal: 1500, activityKcal: 300 };
    const target = { kcal: 2000, carbs: 200, protein: 130, fat: 60 };
    const saved = await userA.rpc("complete_daily_record_v2", {
      p_plan_date: date,
      p_profile: profile,
      p_meals: [],
      p_result: { dailyTarget: target, actualTotals: target },
      p_plan_schema_version: 2,
      p_algorithm_version: "nutrition-v2.3",
      p_integrity_flags: [],
      p_actual: actual,
      p_target: target,
      p_completed: true,
    });
    expect(saved.error).toBeNull();
    const [plan, checkin] = await Promise.all([
      userA.from("daily_plans").select("schema_version,algorithm_version").eq("plan_date", date).single(),
      userA.from("daily_checkins").select("completed,actual").eq("plan_date", date).single(),
    ]);
    expect(plan.data).toMatchObject({ schema_version: 2, algorithm_version: "nutrition-v2.3" });
    expect(checkin.data).toMatchObject({ completed: true, actual: { version: 2 } });

    const invalidDate = "2026-08-23";
    const failed = await userA.rpc("complete_daily_record_v2", {
      p_plan_date: invalidDate,
      p_profile: { planDate: invalidDate },
      p_meals: [],
      p_result: {},
      p_plan_schema_version: 2,
      p_algorithm_version: "nutrition-v2.3",
      p_integrity_flags: [],
      p_actual: { ...actual, version: 1 },
      p_target: target,
      p_completed: true,
    });
    expect(failed.error).not.toBeNull();
    const [missingPlan, missingCheckin] = await Promise.all([
      userA.from("daily_plans").select("id").eq("plan_date", invalidDate),
      userA.from("daily_checkins").select("id").eq("plan_date", invalidDate),
    ]);
    expect(missingPlan.data).toEqual([]);
    expect(missingCheckin.data).toEqual([]);
  });

  it("rolls back an atomic food import and preserves archived history", async () => {
    const imported = await userA.rpc("import_user_foods_v1", {
      p_rows: [
        { ...foodRow("整批合法行") },
        { ...foodRow("整批非法行"), weight_basis: "broken" },
      ],
      p_atomic: true,
    });
    expect(imported.error).not.toBeNull();
    const { data: rolledBack } = await userA.from("foods").select("id").in("name", ["整批合法行", "整批非法行"]);
    expect(rolledBack).toEqual([]);

    const { data: food, error: foodError } = await userA.from("foods").insert(foodRow("历史快照食物")).select("id").single();
    expect(foodError).toBeNull();
    const date = "2026-08-22";
    const snapshot = { version: 1, name: "历史快照食物", category: "主食", kcalPer100g: 100, fatPer100g: 1, carbsPer100g: 20, proteinPer100g: 3, weightBasis: "none", cookedRawRatio: null };
    const { error: planError } = await userA.from("daily_plans").insert({
      user_id: userAId,
      plan_date: date,
      profile: { planDate: date },
      meals: [{ id: "meal", name: "餐", ratio: 1, locked: false, entries: [{ id: "entry", foodId: food!.id, foodSnapshot: snapshot, grams: 100, locked: false }] }],
      result: { dailyTarget: { kcal: 100, carbs: 20, protein: 3, fat: 1 }, actualTotals: { kcal: 100, carbs: 20, protein: 3, fat: 1 } },
      schema_version: 2,
      algorithm_version: "nutrition-v2.3",
    });
    expect(planError).toBeNull();
    const { error: archiveError } = await userA.from("foods").update({ archived_at: new Date().toISOString() }).eq("id", food!.id);
    expect(archiveError).toBeNull();
    const { data: history } = await userA.from("daily_plans").select("meals").eq("plan_date", date).single();
    expect(history?.meals?.[0]?.entries?.[0]?.foodSnapshot).toMatchObject({ name: "历史快照食物" });
  });

  it("paginates past row 30 with the lightweight history projection", async () => {
    const target = { kcal: 2000, carbs: 200, protein: 130, fat: 60 };
    const rows = Array.from({ length: 31 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
      return {
        user_id: userAId,
        plan_date: date,
        profile: { planDate: date, trainingTime: "rest" },
        meals: [],
        result: { dailyTarget: target, actualTotals: target },
        schema_version: 2,
        algorithm_version: "nutrition-v2.3"
      };
    });
    const inserted = await userA.from("daily_plans").upsert(rows, { onConflict: "user_id,plan_date" });
    expect(inserted.error).toBeNull();

    const projection = "id,plan_date,created_at,updated_at,integrity_flags,training_time:profile->>trainingTime,daily_target:result->dailyTarget,actual_totals:result->actualTotals";
    const first = await userA.from("daily_plans").select(projection).order("plan_date", { ascending: false }).order("id", { ascending: false }).limit(30);
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(30);
    expect(first.data?.[0]).toHaveProperty("daily_target");
    const cursor = first.data![29];
    const second = await userA
      .from("daily_plans")
      .select(projection)
      .or(`plan_date.lt.${cursor.plan_date},and(plan_date.eq.${cursor.plan_date},id.lt.${cursor.id})`)
      .order("plan_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(30);
    expect(second.error).toBeNull();
    expect(second.data!.length).toBeGreaterThan(0);
    expect(new Set(first.data!.map((row) => row.id)).has(second.data![0].id)).toBe(false);
  });

  it("projects only heatmap inputs from a large plan result", async () => {
    const date = "2026-08-20";
    const target = { kcal: 2100, carbs: 220, protein: 140, fat: 60 };
    const saved = await userA.from("daily_plans").upsert({
      user_id: userAId,
      plan_date: date,
      profile: { planDate: date, sex: "male", age: 30, heightCm: 180, weightKg: 80, activityFactor: 1.2, trainingTime: "rest" },
      meals: [],
      result: { bmr: 1700, dailyTarget: target, mealRecommendations: Array.from({ length: 50 }, (_, index) => ({ index, payload: "unused" })) },
      schema_version: 2,
      algorithm_version: "nutrition-v2.3"
    }, { onConflict: "user_id,plan_date" });
    expect(saved.error).toBeNull();

    const projected = await userA
      .from("daily_plans")
      .select("id,plan_date,profile,meals,schema_version,algorithm_version,integrity_flags,bmr:result->bmr,daily_target:result->dailyTarget")
      .eq("plan_date", date)
      .single();
    expect(projected.error).toBeNull();
    expect(projected.data).toMatchObject({ bmr: 1700, daily_target: target });
    expect(projected.data).not.toHaveProperty("result");
  });
});
