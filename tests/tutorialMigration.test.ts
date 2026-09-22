// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { expect, it } from "vitest";
it("adds tutorial settings without changing existing profiles or their ownership boundary", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const a = "40000000-0000-4000-8000-000000000001", b = "40000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values ('${a}'),('${b}');`);
    const name = "20260922032404_tutorial_preferences.sql";
    for (const migration of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < name).sort()) await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    await db.exec(`insert into public.profiles(id,display_name,preferences) values ('${a}','保留名称','{"keep":true}'),('${b}','另一个用户','{}');`);
    const policies = (await db.query("select * from pg_policies where tablename='profiles' order by policyname")).rows;
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
    expect((await db.query("select * from pg_policies where tablename='profiles' order by policyname")).rows).toEqual(policies);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.exec("set role authenticated");
    expect((await db.query("select id,tutorial_seen_version,tutorial_every_visit from public.profiles")).rows).toEqual([{ id:a, tutorial_seen_version:0, tutorial_every_visit:false }]);
    await db.exec(`update public.profiles set tutorial_seen_version=1,tutorial_every_visit=true where id='${a}'; update public.profiles set tutorial_seen_version=9 where id='${b}';`);
    await expect(db.exec(`update public.profiles set tutorial_seen_version=-1 where id='${a}'`)).rejects.toThrow();
    await db.exec("reset role");
    expect((await db.query("select display_name,preferences,tutorial_seen_version,tutorial_every_visit from public.profiles where id=$1", [a])).rows[0]).toEqual({ display_name:"保留名称", preferences:{keep:true}, tutorial_seen_version:1, tutorial_every_visit:true });
    expect((await db.query("select tutorial_seen_version from public.profiles where id=$1", [b])).rows[0]).toEqual({tutorial_seen_version:0});
  } finally { await db.close(); }
}, 120000);
