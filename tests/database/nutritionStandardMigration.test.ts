// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTreProtocol } from "@/lib/planPresets";
import { createNutritionSnapshot } from "@/lib/nutritionGoals/snapshot";
import { createNutritionPolicy } from "@/lib/nutritionGoals/presets";
import { targetFromKcal, protocolMeals } from "@/lib/planProtocol";
import { foodSnapshotFromFood } from "@/lib/foodSnapshots";
import { emptyActualV3, confirmMealEvent } from "@/lib/actualIntake";
import { buildNutritionResult } from "@/lib/nutrition";
import { emptyProfile } from "@/lib/demoState";
import { syntheticBody } from "../fixtures/nutritionGoalFixture";
import type { FoodItem } from "@/lib/types";
import { addDays, todayKey } from "@/lib/dateTime";

const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000071", other = "10000000-0000-4000-8000-000000000072";
const nutrition = createNutritionSnapshot({ ...createNutritionPolicy("custom"), rmr: { kind: "not_used" }, tdee: { kind: "not_used" }, energy: { kind: "fixed_kcal", kcal: 2200 }, protein: { kind: "fixed_grams", grams: 180 }, fat: { kind: "fixed_grams", grams: 65 }, carbs: { kind: "residual" } }, { ...syntheticBody, recovery: "stable" });
const protocol = createTreProtocol({ id: "20000000-0000-4000-8000-000000000071", effectiveFrom: "2030-01-01", cycleAnchorDate: "2030-01-01", timeZone: "Asia/Shanghai", nutrition, nutritionStrategy: { version: 1, mode: "fixed_daily" }, preTrainingNoIntakeMinutes: 0 });
const food: FoodItem = { id: "label", name: "合成食品", category: "肉类", weightBasis: "raw", cookedRawRatio: null, source: "user", kcalPer100g: 150, proteinPer100g: 20, carbsPer100g: 10, fatPer100g: 2, sourceKcalPer100g: 150, sourceEnergyMethod: "product_label", effectiveEnergyBasis: "label", sourceQuality: "verified_label", carbohydrateBasis: "unknown", sourceCarbsPer100g: 10, fiberPer100g: null };
async function asUser<T>(user: string | null, run: () => Promise<T>): Promise<T> { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]); await db.exec(user ? "set role authenticated" : "set role anon"); try { return await run(); } finally { await db.exec("reset role"); } }
const call = async (name: string, args: unknown[]) => (await db.query<{ data: unknown }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as data`, args)).rows[0].data;

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${owner}'),('${other}');`);
  await db.exec(readFileSync("supabase/migrations/20260607120000_legacy_schema_baseline.sql", "utf8"));
  const v2 = readFileSync("supabase/migrations/20260607124646_fitness_system_v2_schema.sql", "utf8");
  for (const table of ["profiles", "body_logs", "daily_checkins"]) await db.exec(v2.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`))![0]);
  await db.exec(`create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    alter table public.foods add column source text default 'user',add column serving_description text;
    alter table public.daily_plans add column schema_version smallint not null default 1,add column algorithm_version text,add column integrity_flags text[] not null default '{}';
    alter table public.daily_checkins add column target jsonb;
    create table public.planner_drafts(user_id uuid primary key references auth.users(id),plan_date date not null,profile_snapshot jsonb not null,meals jsonb not null,schema_version smallint not null default 2,revision bigint not null default 1,updated_at timestamptz not null default now());`);
  const storage = readFileSync("supabase/migrations/20260826180000_storage_safety_foundation.sql", "utf8");
  await db.exec(storage.slice(storage.indexOf("create or replace function public.import_user_foods_v1")));
  for (const table of ["daily_plans", "daily_checkins", "planner_drafts", "workout_sessions", "foods", "body_logs"]) await db.exec(`alter table public.${table} enable row level security; grant select,insert,update,delete on public.${table} to authenticated; create policy own on public.${table} for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());`);
  await db.exec(readFileSync("supabase/migrations/20260914072642_tre_rpt_v4_contracts.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260914091735_nutrition_auto_goals_v5.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015095133_nutrition_standard_v6.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });

describe.sequential("饮食标准的 PostgreSQL 验收（独立引擎与合成身份）", () => {
  it("新协议保存仍有成年/恢复/版本校验与原子幂等", async () => {
    expect(await asUser(owner, () => call("activate_plan_protocol_v1", [protocol, null]))).toEqual(protocol);
    expect(await asUser(owner, () => call("activate_plan_protocol_v1", [protocol, null]))).toEqual(protocol);
    const invalid = structuredClone(protocol); invalid.nutrition!.body.scope.adultAttested = false;
    expect(await call("validate_tre_protocol_v2", [invalid])).toBe(false);
    expect(await asUser(owner, () => call("nutrition_standard_capabilities_v1", []))).toBe(3);
  });
  it("来源热量快照可用于草稿、计划和实际，超预算实际如实保留", async () => {
    const profile = { ...emptyProfile, planDate: "2030-01-01", targetMode: "calibrated" as const, allocationMode: "explicitMacros" as const, protocolSnapshot: protocol };
    const meals = protocolMeals(protocol);
    meals[0].entries = [{ id: "entry", foodId: food.id, grams: 2000, foodSnapshot: foodSnapshotFromFood(food), locked: true }];
    const event = confirmMealEvent(meals[0], new Map([[food.id, food]]), { id: "event", timeZone: protocol.timeZone });
    const actual = { ...emptyActualV3(), targetProtocolSnapshot: protocol, intakeComplete: true, mealEvents: [event] };
    const result = buildNutritionResult(profile, meals, [food]);
    await asUser(owner, () => call("complete_daily_record_v3", [profile.planDate, profile, meals, result, 3, "nutrition-v5.0", [], actual, protocol.dailyTarget, true, null]));
    const saved = (await asUser(owner, () => db.query<{ actual: { foods: { totals: { kcal: number } }[] } }>("select actual from public.daily_checkins"))).rows[0];
    expect(saved.actual.foods[0].totals.kcal).toBe(3000);
    expect((await db.query<{ valid: boolean }>("select public.valid_food_snapshot_v2($1) as valid", [foodSnapshotFromFood(food)])).rows[0].valid).toBe(true);
    const corrupted = { ...foodSnapshotFromFood(food), fiberPer100g: -1 };
    expect(await call("valid_food_snapshot_v2", [corrupted])).toBe(false);
    meals[0].entries[0].inputWeightBasis = "cooked";
    await expect(asUser(owner, () => call("save_planner_draft_v3", [profile.planDate, profile, meals, 3, null, false]))).rejects.toThrow("WEIGHT_BASIS_MISMATCH");
  });
  it("个人标准只属于当前用户，匿名与其他账户不可写入或读取", async () => {
    const payload = { documentType: "personal_nutrition_standard", documentVersion: "1.0.0", status: "proposal_not_activated", defaultMode: "fixed_daily", optionalCarbCycle: { enabled: false } };
    await asUser(owner, () => db.query("insert into public.nutrition_standard_proposals(user_id,payload) values($1,$2)", [owner, payload]));
    expect((await asUser(other, () => db.query("select payload from public.nutrition_standard_proposals"))).rows).toEqual([]);
    await expect(asUser(other, () => db.query("insert into public.nutrition_standard_proposals(user_id,payload) values($1,$2)", [owner, payload]))).rejects.toThrow();
    await expect(asUser(null, () => db.query("select * from public.nutrition_standard_proposals"))).rejects.toThrow();
  });
  it("训练/休息日解析一致；缺少14天实际时不能启用周期", async () => {
    const next = createTreProtocol({ id: "20000000-0000-4000-8000-000000000073", effectiveFrom: "2030-01-02", cycleAnchorDate: "2030-01-02", timeZone: "Asia/Shanghai", previous: protocol, nutrition, nutritionStrategy: { version: 1, mode: "weekly_cycle", isoWeekdaysTraining: [1, 2, 4, 6], trainingTarget: targetFromKcal(2275, 180, 65), restTarget: targetFromKcal(2100, 180, 65), weeklyTargetKcal: 15400, startAfterStableLoggingDays: 14 } });
    expect(await call("validate_tre_protocol_v2", [next])).toBe(true);
    expect(await call("nutrition_target_on_date_v1", [next, "2030-01-02"])).toEqual(next.nutritionStrategy?.mode === "weekly_cycle" ? next.nutritionStrategy.restTarget : null);
    await expect(asUser(owner, () => call("activate_plan_protocol_v1", [next, protocol.id]))).rejects.toThrow("cycle_requires_14");
    expect(await asUser(owner, () => call("nutrition_stable_logging_days_v1", []))).toBe(0);
  });
  it("14天完整实际允许确认周期；服务器拒绝当日目标冒用周平均值", async () => {
    const today = todayKey("Asia/Shanghai");
    const fixed = createTreProtocol({ id: "20000000-0000-4000-8000-000000000074", effectiveFrom: addDays(today, -13), cycleAnchorDate: addDays(today, -13), timeZone: "Asia/Shanghai", nutrition });
    await asUser(other, () => call("activate_plan_protocol_v1", [fixed, null]));
    const meal = protocolMeals(fixed)[0];
    meal.entries = [{ id: "entry", foodId: food.id, grams: 2200 / 150 * 100, locked: false }];
    const event = confirmMealEvent(meal, new Map([[food.id, food]]), { id: "event", timeZone: fixed.timeZone });
    const actual = { ...emptyActualV3(), intakeComplete: true, mealEvents: [event], targetProtocolSnapshot: fixed };
    for (let i = 0; i < 14; i++) await asUser(other, () => call("save_daily_actual_v3", [addDays(today, -i), actual, fixed.dailyTarget, true, null]));
    expect(await asUser(other, () => call("nutrition_stable_logging_days_v1", []))).toBe(14);
    const next = createTreProtocol({ id: "20000000-0000-4000-8000-000000000075", effectiveFrom: addDays(today, 1), cycleAnchorDate: addDays(today, 1), timeZone: "Asia/Shanghai", previous: fixed, nutrition, nutritionStrategy: { version: 1, mode: "weekly_cycle", isoWeekdaysTraining: [1, 2, 4, 6], trainingTarget: targetFromKcal(2275, 180, 65), restTarget: targetFromKcal(2100, 180, 65), weeklyTargetKcal: 15400, startAfterStableLoggingDays: 14 } });
    expect(await asUser(other, () => call("activate_plan_protocol_v1", [next, fixed.id]))).toEqual(next);
    const nextActual = { ...actual, targetProtocolSnapshot: next };
    await expect(asUser(other, () => call("save_daily_actual_v3", [next.effectiveFrom, nextActual, next.dailyTarget, false, null]))).rejects.toThrow("invalid_actual_target_protocol");
    const dated = await call("nutrition_target_on_date_v1", [next, next.effectiveFrom]);
    await asUser(other, () => call("save_daily_actual_v3", [next.effectiveFrom, nextActual, dated, false, null]));
    expect((await db.query<{ count: number }>("select count(*)::integer as count from public.daily_checkins where user_id=$1 and completed", [other])).rows[0].count).toBe(14);
  });
  it("批量导入保留来源字段和未知纤维，缺失营养不会写为零", async () => {
    const row = { name: "合成导入样品", category: "肉类", weight_basis: "raw", protein_per_100g: 20, carbs_per_100g: 10, fat_per_100g: 2, kcal_per_100g: 150, source_kcal_per_100g: 150, effective_energy_basis: "label", source_energy_method: "product_label", source_quality: "verified_label", carbohydrate_basis: "unknown", source_carbs_per_100g: 10, fiber_per_100g: null };
    expect(await asUser(owner, () => call("import_user_foods_v1", [[row], true]))).toEqual({ inserted: 1, errors: [] });
    const saved = (await asUser(owner, () => db.query("select source_kcal_per_100g,fiber_per_100g,effective_energy_basis from public.foods"))).rows[0];
    expect(saved).toEqual({ source_kcal_per_100g: "150", fiber_per_100g: null, effective_energy_basis: "label" });
    await expect(asUser(owner, () => call("import_user_foods_v1", [[{ name: "missing", weight_basis: "raw" }], true]))).rejects.toThrow();
  });
});
