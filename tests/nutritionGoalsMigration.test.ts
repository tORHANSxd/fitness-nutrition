// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticBody, syntheticGoalProtocol, syntheticPolicy } from "./helpers/nutritionGoalFixture";
import { createNutritionSnapshot } from "@/lib/nutritionGoals/snapshot";
import { createNutritionPolicy } from "@/lib/nutritionGoals/presets";
import type { NutritionPolicyV1 } from "@/lib/nutritionGoals/types";
import { createTreProtocol } from "@/lib/planPresets";
import { protocolMeals } from "@/lib/planProtocol";
import { buildNutritionResult } from "@/lib/nutrition";
import { emptyProfile } from "@/lib/demoState";
import { emptyActualV3 } from "@/lib/actualIntake";
import { configureMealLayout } from "@/lib/mealLayout";
import type { UserProfile } from "@/lib/types";

// Isolated PostgreSQL with synthetic claims and v4 predecessor tables, not Supabase Auth/PostgREST.
const db = new PGlite();
const userA = "10000000-0000-4000-8000-000000000051", userB = "10000000-0000-4000-8000-000000000052";
const legacy = createTreProtocol({ id: "20000000-0000-4000-8000-000000000050", effectiveFrom: "2025-12-31", cycleAnchorDate: "2025-12-31", timeZone: "Asia/Shanghai" });
const protocol = syntheticGoalProtocol({ previous: legacy });
const profile: UserProfile = { ...emptyProfile, planDate: "2026-01-01", targetMode: "calibrated", allocationMode: "explicitMacros", protocolSnapshot: protocol };
const meals = protocolMeals(protocol), result = buildNutritionResult(profile, meals, []);
const actual = { ...emptyActualV3(), intakeComplete: true, targetProtocolSnapshot: protocol };
async function asUser<T>(user: string | null, action: () => Promise<T>): Promise<T> { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]); await db.exec(user ? "set role authenticated" : "set role anon"); try { return await action(); } finally { await db.exec("reset role"); } }
async function rpc(name: string, args: unknown[]) { return (await db.query<{ data: Record<string, unknown> }>(`select to_jsonb(public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})) as data`, args)).rows[0].data; }
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${userA}'),('${userB}');`);
  await db.exec(readFileSync("supabase/migrations/20260607120000_legacy_schema_baseline.sql", "utf8"));
  const v2 = readFileSync("supabase/migrations/20260607124646_fitness_system_v2_schema.sql", "utf8");
  for (const table of ["profiles", "daily_checkins"]) await db.exec(v2.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`))![0]);
  await db.exec(`alter table public.daily_plans add column schema_version smallint not null default 1,add column algorithm_version text,add column integrity_flags text[] not null default '{}';
    alter table public.daily_checkins add column target jsonb;
    create table public.planner_drafts(user_id uuid primary key references auth.users(id),plan_date date not null,profile_snapshot jsonb not null,meals jsonb not null,schema_version smallint not null default 2,revision bigint not null default 1,updated_at timestamptz not null default now());
    alter table public.daily_plans enable row level security; alter table public.daily_checkins enable row level security; alter table public.planner_drafts enable row level security; alter table public.workout_sessions enable row level security;
    grant select,insert,update,delete on public.daily_plans,public.daily_checkins,public.planner_drafts,public.workout_sessions to authenticated;
    create policy own on public.daily_plans for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy own on public.daily_checkins for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy own on public.planner_drafts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy own on public.workout_sessions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());`);
  await db.exec(readFileSync("supabase/migrations/20260914072642_tre_rpt_v4_contracts.sql", "utf8"));
  await asUser(userA, () => rpc("activate_plan_protocol_v1", [legacy, null]));
  await db.exec(readFileSync("supabase/migrations/20260914091735_nutrition_auto_goals_v5.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });
describe.sequential("v5 PostgreSQL schema, ownership, idempotency and atomicity", () => {
  it("validates every preset plus manual, FFM and component-expenditure math", async () => {
    const custom: NutritionPolicyV1 = { ...createNutritionPolicy("custom"), energy: { kind: "fixed_kcal", kcal: 2205 }, protein: { kind: "fixed_grams", grams: 175 }, fat: { kind: "fixed_grams", grams: 65 } };
    const policies: NutritionPolicyV1[] = [
      ...(["cut_recomp", "cut_lean", "recomp", "lean_gain", "maintain"] as const).map(syntheticPolicy), custom,
      { ...custom, energy: { kind: "from_macros" }, carbs: { kind: "fixed_grams", grams: 230 } },
      { ...custom, fat: { kind: "energy_share", share: .25 } },
      { ...custom, energy: { kind: "percent", deltaRatio: -.15 }, tdee: { kind: "manual", kcal: 2600, source: "user_estimate" } },
      { ...custom, rmr: { kind: "cunningham_1980" }, tdee: { kind: "pal_total", multiplier: 1.5, includesExercise: true }, energy: { kind: "percent", deltaRatio: 0 } },
      { ...custom, protein: { kind: "ffm", coefficient: 2.6, contextConfirmed: true } },
      { ...custom, rmr: { kind: "measured", kcal: 1800, measuredOn: syntheticBody.calculationDate, sourceLabel: "Synthetic measurement" }, tdee: { kind: "non_exercise_plus_planned", multiplier: 1.3, cycleDays: 8, netConfirmed: true, netExercise: [1, 2, 3, 4].map(i => ({ id: `net-${i}`, kcal: 300 })) }, energy: { kind: "percent", deltaRatio: 0 } },
    ];
    for (const policy of policies) {
      const snapshot = createNutritionSnapshot(policy, { ...syntheticBody, ffmInput: "direct", ffmKg: 68, ffmMeasuredOn: syntheticBody.calculationDate, ffmSourceLabel: "Synthetic FFM" });
      const validation = await db.query<{ valid: boolean }>("select public.validate_nutrition_snapshot_v1($1) as valid", [snapshot]);
      expect(validation.rows[0].valid, JSON.stringify(policy)).toBe(true);
    }
  });
  it("rejects misleading preset labels, forged trace and weak measurement provenance", async () => {
    const cases = [
      { ...protocol.nutrition!, schemaVersion: "1" },
      { ...protocol.nutrition!, policy: { ...protocol.nutrition!.policy, presetId: "maintain" } },
      { ...protocol.nutrition!, policy: { ...protocol.nutrition!.policy, presetId: "custom" } },
      { ...protocol.nutrition!, body: { ...syntheticBody, weightSource: "seven_day_mean", weightDates: ["2026-01-01", "2026-01-01", "2025-12-31", "2025-12-30"] } },
      { ...protocol.nutrition!, result: { ...protocol.nutrition!.result, trace: protocol.nutrition!.result.trace.map(t => t.stepId === "energy" ? { ...t, rawValue: 9999 } : t) } },
    ];
    for (const snapshot of cases) expect((await db.query<{ valid: boolean }>("select public.validate_nutrition_snapshot_v1($1) as valid", [snapshot])).rows[0].valid).toBe(false);
  });
  it("preserves the existing fixed protocol and activates v5 in the same table", async () => {
    expect(await asUser(userA, () => rpc("activate_plan_protocol_v1", [legacy, null]))).toEqual(legacy);
    expect(await asUser(userA, () => rpc("activate_plan_protocol_v1", [protocol, legacy.id]))).toEqual(protocol);
    expect((await db.query("select schema_version from public.user_plan_protocols order by effective_from")).rows).toEqual([{ schema_version: 1 }, { schema_version: 2 }]);
  });
  it("round-trips full evidence and rejects stale draft revisions", async () => {
    await asUser(userA, () => rpc("save_planner_draft_v3", [profile.planDate, profile, meals, 3, null, false]));
    const row = (await asUser(userA, () => db.query<Record<string, unknown>>("select profile_snapshot from public.planner_drafts"))).rows[0];
    expect(row.profile_snapshot).toEqual(profile);
    await expect(asUser(userA, () => rpc("save_planner_draft_v3", [profile.planDate, profile, meals, 3, 0, false]))).rejects.toThrow("draft_conflict");
  });
  it("denies foreign/anonymous writes and foreign protocol references", async () => {
    await expect(asUser(null, () => rpc("activate_plan_protocol_v1", [protocol, legacy.id]))).rejects.toThrow();
    expect((await asUser(userB, () => db.query("select * from public.user_plan_protocols"))).rows).toEqual([]);
    await expect(asUser(userB, () => rpc("save_planner_draft_v3", [profile.planDate, profile, meals, 3, null, false]))).rejects.toThrow("invalid_protocol_reference");
    await expect(asUser(userB, () => rpc("save_daily_actual_v3", [profile.planDate, actual, protocol.dailyTarget, false, null]))).rejects.toThrow("invalid_actual_target_protocol");
  });
  it("refuses invalid schema, math, requestId and cross-method payloads", async () => {
    for (const modify of [
      (p: typeof protocol) => { p.schemaVersion = 99 as 2; },
      (p: typeof protocol) => { p.requestId = crypto.randomUUID(); },
      (p: typeof protocol) => { p.nutrition!.policy.tdee = { kind: "pal_total", multiplier: 1.5, includesExercise: true, exerciseKcal: 400 } as unknown as NonNullable<typeof p.nutrition>["policy"]["tdee"]; },
      (p: typeof protocol) => { p.nutrition!.result.resolvedTarget!.protein += 1; },
      (p: typeof protocol) => { p.nutrition!.body.scope.adultAttested = false; },
      (p: typeof protocol) => { p.nutrition!.body.ageYears = 17; },
      (p: typeof protocol) => { p.nutrition!.body.calculationDate = "2026-02-30"; },
    ]) {
      const invalid = structuredClone(protocol); modify(invalid);
      await expect(asUser(userA, () => rpc("activate_plan_protocol_v1", [invalid, legacy.id]))).rejects.toThrow("invalid_protocol");
    }
  });
  it("rolls actual write back when later plan validation fails", async () => {
    const args: unknown[] = [profile.planDate, profile, meals, { ...result, targetResolution: null }, 3, "nutrition-v5.0", [], actual, protocol.dailyTarget, true, null];
    await expect(asUser(userA, () => rpc("complete_daily_record_v3", args))).rejects.toThrow("nutrition_result_mismatch");
    expect((await db.query("select * from public.daily_checkins")).rows).toEqual([]);
    expect((await db.query("select * from public.daily_plans")).rows).toEqual([]);
    args[3] = result;
    await asUser(userA, () => rpc("complete_daily_record_v3", args));
    const row = (await db.query<Record<string, unknown>>("select actual,target from public.daily_checkins")).rows[0];
    expect(row.actual).toEqual(actual); expect(row.target).toEqual(protocol.dailyTarget);
  });
  it("serializes competing strategies, deduplicates retries and freezes confirmed history", async () => {
    const next = syntheticGoalProtocol({ id: "20000000-0000-4000-8000-000000000052", date: "2026-01-02", previous: protocol, policy: syntheticPolicy("maintain") });
    const competing = { ...next, id: "20000000-0000-4000-8000-000000000053", requestId: "20000000-0000-4000-8000-000000000053" };
    await asUser(userA, () => rpc("activate_plan_protocol_v1", [next, protocol.id]));
    await expect(asUser(userA, () => rpc("activate_plan_protocol_v1", [competing, protocol.id]))).rejects.toThrow("protocol_conflict");
    expect(await asUser(userA, () => rpc("activate_plan_protocol_v1", [protocol, legacy.id]))).toEqual(protocol);
    expect((await db.query("select id from public.user_plan_protocols")).rows).toHaveLength(3);
    const saved = (await db.query<Record<string, unknown>>("select profile,result from public.daily_plans")).rows[0];
    expect(saved.profile).toEqual(profile); expect(saved.result).toEqual(result);
    await expect(asUser(userA, () => db.query("update public.daily_checkins set actual=actual-'targetProtocolSnapshot'"))).rejects.toThrow("use_revision_rpc");
    await asUser(userA, () => rpc("save_daily_actual_v3", [profile.planDate, actual, protocol.dailyTarget, false, 1]));
    await expect(asUser(userA, () => rpc("save_daily_actual_v3", [profile.planDate, { ...actual, targetProtocolSnapshot: undefined }, protocol.dailyTarget, false, 2]))).rejects.toThrow("frozen_actual_target_protocol");
  });
  it("existing SQL accepts custom meal counts for legacy and calibrated days without changing protocols/history", async () => {
    const slots = Array.from({ length: 5 }, (_, i) => ({ id: `custom-meal-${i}`, name: `五餐${i + 1}`, weights: { protein: i + 1, carbs: 5 - i, fat: 1 } }));
    const custom = configureMealLayout([], slots, protocol.dailyTarget);
    await expect(asUser(userB, () => rpc("save_planner_draft_v3", [profile.planDate, profile, custom, 3, null, false]))).rejects.toThrow("invalid_protocol_reference");
    const legacyProfile = { ...emptyProfile, planDate: profile.planDate, allocationMode: "explicitMacros" };
    await asUser(userB, () => rpc("save_planner_draft_v3", [profile.planDate, legacyProfile, custom, 3, null, false]));
    expect((await asUser(userB, () => db.query<{ meals: unknown }>("select meals from public.planner_drafts"))).rows[0].meals).toEqual(custom);
    const before = (await db.query("select * from public.daily_plans")).rows;
    const revision = (await asUser(userA, () => db.query<{ revision: number }>("select revision from public.planner_drafts"))).rows[0].revision;
    await asUser(userA, () => rpc("save_planner_draft_v3", [profile.planDate, profile, custom, 3, revision, false]));
    const stored = (await asUser(userA, () => db.query<{ meals: unknown }>("select meals from public.planner_drafts"))).rows[0];
    expect(stored.meals).toEqual(custom);
    expect((await db.query("select * from public.daily_plans")).rows).toEqual(before);
    const invalid = structuredClone(custom); invalid[0].targetAllocation!.protein = .9;
    await expect(asUser(userA, () => rpc("save_planner_draft_v3", [profile.planDate, profile, invalid, 3, revision + 1, false]))).rejects.toThrow("invalid_allocation_sum");
  });
  it("matches the reviewed v5 catalog supplement without including row data", async () => {
    const names = ["nutrition_goals_capabilities_v1", "nutrition_number_v1", "validate_nutrition_snapshot_v1", "validate_tre_protocol_v2", "activate_plan_protocol_v1", "validate_plan_document_v3", "guard_nutrition_snapshots_v1"];
    const functions = await db.query<{ definition: string; acl: string }>("select pg_get_functiondef(p.oid) as definition,coalesce(p.proacl::text,'default') as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1) order by p.proname", [names]);
    const constraints = await db.query<{ name: string; definition: string }>("select conname as name,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.user_plan_protocols'::regclass and conname in ('user_plan_protocols_schema_version_check','user_plan_protocols_config_check') order by conname");
    const triggers = await db.query<{ definition: string }>("select pg_get_triggerdef(oid) as definition from pg_trigger where tgfoid='public.guard_nutrition_snapshots_v1()'::regprocedure order by tgname");
    const snapshot = "-- V5 catalog review supplement, generated by isolated PGlite tests.\n-- Synthetic v4 predecessor tables; not a full Supabase Auth/PostgREST dump or restore script.\n-- No row data. Keep supabase/schema.sql unchanged until a full local stack can be rebuilt.\n\n"
      + functions.rows.map(r => `-- ACL: ${r.acl}\n${r.definition.trim()};\n`).join("\n")
      + constraints.rows.map(r => `-- user_plan_protocols.${r.name}: ${r.definition}\n`).join("")
      + triggers.rows.map(r => `${r.definition};\n`).join("");
    const path = "supabase/schema.nutrition-v5.sql";
    if (process.env.UPDATE_NUTRITION_SCHEMA_REVIEW === "1") writeFileSync(path, snapshot, "utf8");
    expect(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).toBe(snapshot);
  });
});
