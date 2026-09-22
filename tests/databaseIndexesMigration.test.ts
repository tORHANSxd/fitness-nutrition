// @vitest-environment node
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTreProtocol } from "@/lib/planPresets";

// Executes the unmodified migration SQL in order, including pgcrypto.
// Auth roles/claims are synthetic; this is not the Supabase Auth/PostgREST stack.
const db = new PGlite({ extensions: { pgcrypto } });
const migrationName = "20260915015415_database_relationship_indexes.sql";
const migration = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
const userA = "10000000-0000-4000-8000-000000000071";
const userB = "10000000-0000-4000-8000-000000000072";
const targets = [
  { table: "user_plan_protocols", column: "supersedes_id", index: "user_plan_protocols_user_supersedes_idx", kind: "protocol" },
  { table: "workout_schedules", column: "protocol_id", index: "workout_schedules_user_protocol_idx", kind: "protocol" },
  { table: "workout_sessions", column: "schedule_id", index: "workout_sessions_user_schedule_idx", kind: "schedule" },
];
type Plan = { "Index Name"?: string; "Rows Removed by Filter"?: number; Plans?: Plan[]; [key: string]: unknown };
const flatten = (plan: Plan): Plan[] => [plan, ...(plan.Plans ?? []).flatMap(flatten)];
async function explain(target: typeof targets[number]) {
  const query = `select id from public.${target.table} where user_id=$1::uuid and ${target.column}=md5($1 || ':${target.kind}:750')::uuid`;
  const { rows } = await db.query<{ "QUERY PLAN": { Plan: Plan; "Execution Time": number }[] }>(`explain (analyze, buffers, format json) ${query}`, [userA]);
  return rows[0]["QUERY PLAN"][0];
}
async function fingerprint() {
  const data = await Promise.all(targets.map(({ table }) => db.query(`select count(*)::int as count, md5(string_agg(to_jsonb(t)::text, ',' order by id)) as digest from public.${table} t`)));
  return data.map(result => result.rows);
}
async function securityCatalog() {
  return (await db.query(`select c.relname,c.relrowsecurity,c.relacl,
    (select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
    (select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid) as constraints
    from pg_class c where c.oid in ('public.user_plan_protocols'::regclass,'public.workout_schedules'::regclass,'public.workout_sessions'::regclass) order by c.relname`)).rows;
}
async function asUser<T>(user: string | null, action: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.exec(user ? "set role authenticated" : "set role anon");
  try { return await action(); } finally { await db.exec("reset role"); }
}

let beforeData: unknown, beforeSecurity: unknown;
const beforePlans: Awaited<ReturnType<typeof explain>>[] = [];
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${userA}'),('${userB}');`);
  const predecessors = readdirSync("supabase/migrations").filter(name => name.endsWith(".sql") && name < migrationName).sort();
  for (const name of predecessors) await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  expect(predecessors).toHaveLength(9);
  const config = createTreProtocol({ id: "20000000-0000-4000-8000-000000000071", effectiveFrom: "2020-01-01", cycleAnchorDate: "2020-01-01", timeZone: "Asia/Shanghai" });
  // 1,500 relationships per synthetic user, preserving the real checks and FKs.
  await db.query(`insert into public.user_plan_protocols(id,user_id,preset_id,config,effective_from,supersedes_id,change_reason)
    select md5(u.id || ':protocol:' || n)::uuid,u.id,'eveningTreRptV4',
      $1::jsonb || jsonb_build_object('id',md5(u.id || ':protocol:' || n)::uuid,'effectiveFrom',(date '2020-01-01'+n)::text,
      'supersedesId',case when n>1 then md5(u.id || ':protocol:' || (n-1))::uuid end),
      date '2020-01-01'+n,case when n>1 then md5(u.id || ':protocol:' || (n-1))::uuid end,$1::jsonb->>'changeReason'
    from auth.users u cross join generate_series(1,1500) n`, [config]);
  await db.exec(`insert into public.workout_schedules(id,user_id,session_date,day_kind,protocol_id,prescription,time_zone)
    select md5(user_id || ':schedule:' || (effective_from-date '2020-01-01'))::uuid,user_id,effective_from,'training',id,
      '{"exercises":[{"exercise":"synthetic","sets":3}]}'::jsonb,'Asia/Shanghai' from public.user_plan_protocols;
    insert into public.workout_sessions(user_id,session_date,split_label,schedule_id)
    select user_id,session_date,'synthetic',id from public.workout_schedules;
    analyze public.user_plan_protocols; analyze public.workout_schedules; analyze public.workout_sessions;`);
  beforeData = await fingerprint(); beforeSecurity = await securityCatalog();
  for (const target of targets) beforePlans.push(await explain(target));
  await db.exec(migration);
// The full migration chain and 3,000 checked protocol documents can exceed a
// minute when the other PostgreSQL suites run concurrently on the same machine.
}, 120000);
afterAll(async () => { await db.close(); });

describe.sequential("relationship index migration", () => {
  it("preserves all 9,000 synthetic records, ownership policies and constraints", async () => {
    expect(await fingerprint()).toEqual(beforeData);
    expect(await securityCatalog()).toEqual(beforeSecurity);
  });

  it("creates valid non-unique indexes covering exactly the three child foreign keys", async () => {
    for (const target of targets) {
      const { rows } = await db.query(`select i.indisvalid,i.indisunique,pg_get_indexdef(i.indexrelid) as definition
        from pg_index i where i.indexrelid=to_regclass($1)`, [`public.${target.index}`]);
      expect(rows).toEqual([{ indisvalid: true, indisunique: false, definition: `CREATE INDEX ${target.index} ON public.${target.table} USING btree (user_id, ${target.column})` }]);
    }
  });

  it("uses each new index for the relationship lookup, with fewer rows filtered", async () => {
    const evidence = [];
    for (const [i, target] of targets.entries()) {
      const after = await explain(target), before = beforePlans[i];
      expect(flatten(after.Plan).some(node => node["Index Name"] === target.index)).toBe(true);
      const filtered = (plan: Plan) => flatten(plan).reduce((sum, node) => sum + (node["Rows Removed by Filter"] ?? 0), 0);
      expect(filtered(after.Plan)).toBeLessThan(filtered(before.Plan));
      evidence.push({ table: target.table, syntheticRows: 3000, before, after });
    }
    mkdirSync(".verification/db-optimization", { recursive: true });
    writeFileSync(".verification/db-optimization/local-query-plans.json", JSON.stringify(evidence, null, 2));
  });

  it("keeps other users and anonymous clients out, and rejects cross-owner references", async () => {
    for (const { table } of targets) {
      const own = await asUser(userA, () => db.query(`select distinct user_id from public.${table}`));
      expect(own.rows).toEqual([{ user_id: userA }]);
      await expect(asUser(null, () => db.query(`select id from public.${table}`))).rejects.toThrow(/permission denied/);
    }
    await expect(db.query(`update public.workout_schedules set protocol_id=md5($1 || ':protocol:1')::uuid
      where user_id=$2 and session_date='2020-01-02'`, [userB, userA])).rejects.toMatchObject({ code: "23503" });
    await expect(db.query(`update public.workout_sessions set schedule_id=md5($1 || ':schedule:1')::uuid
      where user_id=$2 and session_date='2020-01-02'`, [userB, userA])).rejects.toMatchObject({ code: "23503" });
    await expect(db.query(`delete from public.user_plan_protocols where id=md5($1 || ':protocol:750')::uuid`, [userA])).rejects.toMatchObject({ code: "23503" });
    expect(await fingerprint()).toEqual(beforeData);
  });

  it("can roll back only these indexes and reapply without changing history", async () => {
    await db.exec(`begin; ${targets.map(target => `drop index public.${target.index};`).join("\n")} commit;`);
    expect(await fingerprint()).toEqual(beforeData);
    await db.exec(migration);
    expect(await securityCatalog()).toEqual(beforeSecurity);
    expect(await fingerprint()).toEqual(beforeData);
  });
});
