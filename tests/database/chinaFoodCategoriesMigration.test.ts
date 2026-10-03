// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite({ extensions: { pgcrypto } });
const migrationName = "20260915081259_china_food_catalog_categories.sql";
const userA = "30000000-0000-4000-8000-000000000001";
const userB = "30000000-0000-4000-8000-000000000002";
let beforePolicies: unknown;
const policies = async () => (await db.query("select * from pg_policies where tablename in ('foods','food_overrides') order by tablename,policyname")).rows;
const row = (category: string) => ({ name: `测试${category}`, category, kcal_per_100g: 100, carbs_per_100g: 20, protein_per_100g: 5, fat_per_100g: 0, weight_basis: "none", cooked_raw_ratio: null });
async function asUser<T>(user: string | null, action: () => Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.exec(user ? "set role authenticated" : "set role anon");
  try { return await action(); } finally { await db.exec("reset role"); }
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${userA}'),('${userB}');`);
  for (const name of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql") && name < migrationName).sort()) await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await asUser(userA, () => db.query("select public.import_user_foods_v1($1::jsonb,true)", [[row("主食")]]));
  beforePolicies = await policies();
  await db.exec(readFileSync(`supabase/migrations/${migrationName}`, "utf8"));
}, 120000);
afterAll(async () => { await db.close(); });

describe.sequential("China food catalog category migration", () => {
  it("preserves existing food rows and ownership policies", async () => {
    expect(await policies()).toEqual(beforePolicies);
    expect((await db.query("select name,category,user_id from public.foods where name='测试主食'")).rows).toEqual([{ name: "测试主食", category: "主食", user_id: userA }]);
  });
  it("supports new categories through atomic imports and public overrides", async () => {
    const categories = ["豆类", "乳制品", "其他"];
    const result = await asUser(userA, () => db.query<{ result: { inserted: number } }>("select public.import_user_foods_v1($1::jsonb,true) as result", [categories.map((category) => ({ ...row(category), user_id: userB }))]));
    expect(result.rows[0].result.inserted).toBe(3);
    for (const category of categories) await asUser(userA, () => db.query(`insert into public.food_overrides(user_id,base_food_id,name,category,kcal_per_100g,carbs_per_100g,protein_per_100g,fat_per_100g,weight_basis)
      values ($1,$2,$3,$3,100,20,5,0,'none')`, [userA, `public-cfcd6-${category}`, category]));
    expect((await db.query("select distinct user_id from public.foods")).rows).toEqual([{ user_id: userA }]);
    const otherUser = await asUser(userB, () => db.query("select * from public.food_overrides"));
    expect(otherUser.rows).toEqual([]);
  });
  it("retains atomic rollback and rejects invalid categories and anonymous imports", async () => {
    const count = async () => (await db.query("select count(*) from public.foods")).rows;
    const before = await count();
    await expect(asUser(userA, () => db.query("select public.import_user_foods_v1($1::jsonb,true)", [[row("乳制品"), row("invalid")]]))).rejects.toThrow();
    expect(await count()).toEqual(before);
    await expect(asUser(null, () => db.query("select public.import_user_foods_v1($1::jsonb,true)", [[row("豆类")]]))).rejects.toThrow();
  });
});
