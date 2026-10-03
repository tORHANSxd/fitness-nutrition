// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTreProtocol } from "@/lib/planPresets";
import { protocolMeals } from "@/lib/planProtocol";
import { emptyProfile } from "@/lib/demoState";
import { emptyActualV3 } from "@/lib/actualIntake";
import { previewCycle, setsFromPrescription } from "@/lib/trainingCycle";

// In-memory PostgreSQL engine, synthetic auth claims and predecessor table shapes.
// Does not verify Supabase Auth/PostgREST or replace test:db/reset of the full migration chain.
const db = new PGlite();
const userA="10000000-0000-4000-8000-000000000001";
const userB="10000000-0000-4000-8000-000000000002";
const protocol=createTreProtocol({id:"20000000-0000-4000-8000-000000000001",effectiveFrom:"2026-01-01",cycleAnchorDate:"2026-01-01",timeZone:"Asia/Shanghai"});
const profile={...emptyProfile,planDate:"2026-01-01",targetMode:"calibrated",allocationMode:"explicitMacros",protocolSnapshot:protocol};
const meals=protocolMeals(protocol);
const actual={...emptyActualV3(),intakeComplete:true,mealEvents:[{id:"event-1",timeZone:"Asia/Shanghai",entryMethod:"measured",containsCalories:false,actualFoodEntries:[],note:"合成测试：零热量饮品"}]};
async function asUser<T>(user:string|null, action:()=>Promise<T>):Promise<T>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??""]);await db.exec(user?"set role authenticated":"set role anon");try{return await action();}finally{await db.exec("reset role");}}
async function rpc(name:string,args:unknown[]){const slots=args.map((_,i)=>`$${i+1}`).join(",");return (await db.query<{data:Record<string,unknown>}>(`select to_jsonb(public.${name}(${slots})) as data`,args)).rows[0].data;}

beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${userA}'),('${userB}');`);
  await db.exec(readFileSync("supabase/migrations/20260607120000_legacy_schema_baseline.sql","utf8"));
  const v2=readFileSync("supabase/migrations/20260607124646_fitness_system_v2_schema.sql","utf8");
  for(const table of ["profiles","daily_checkins"]) await db.exec(v2.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`))![0]);
  await db.exec(`alter table public.daily_plans add column schema_version smallint not null default 1,add column algorithm_version text,add column integrity_flags text[] not null default '{}';
    alter table public.daily_checkins add column target jsonb;
    create table public.planner_drafts(user_id uuid primary key references auth.users(id),plan_date date not null,profile_snapshot jsonb not null,meals jsonb not null,schema_version smallint not null default 2,revision bigint not null default 1,updated_at timestamptz not null default now());
    alter table public.daily_plans enable row level security; alter table public.daily_checkins enable row level security; alter table public.planner_drafts enable row level security; alter table public.workout_sessions enable row level security;
    grant select,insert,update,delete on public.daily_plans,public.daily_checkins,public.planner_drafts,public.workout_sessions to authenticated;
    create policy own on public.daily_plans for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy own on public.daily_checkins for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy own on public.planner_drafts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy own on public.workout_sessions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());`);
  await db.exec(readFileSync("supabase/migrations/20260914072642_tre_rpt_v4_contracts.sql","utf8"));
  await asUser(userA,()=>rpc("activate_plan_protocol_v1",[protocol,null]));
},30000);
afterAll(async()=>{await db.close();});

describe.sequential("TRE migration in isolated PostgreSQL",()=>{
  it("isolates immutable protocols and rejects anonymous/foreign references",async()=>{
    await expect(asUser(null,()=>rpc("activate_plan_protocol_v1",[protocol,null]))).rejects.toThrow();
    expect(await asUser(userB,async()=>(await db.query("select * from public.user_plan_protocols")).rows)).toEqual([]);
    await expect(asUser(userA,()=>db.query("update public.user_plan_protocols set change_reason='bad'"))).rejects.toThrow();
    await expect(asUser(userB,()=>rpc("save_planner_draft_v3",["2026-01-01",profile,meals,3,null,false]))).rejects.toThrow("invalid_protocol_reference");
    expect(await asUser(userA,()=>rpc("activate_plan_protocol_v1",[protocol,null]))).toEqual(protocol);
  });
  it("round-trips V3 drafts and rejects stale revisions and downgrade writes",async()=>{
    const saved=await asUser(userA,()=>rpc("save_planner_draft_v3",["2026-01-01",profile,meals,3,null,false]));
    expect(Number(saved.revision)).toBe(1);
    await expect(asUser(userA,()=>rpc("save_planner_draft_v3",["2026-01-01",profile,meals,3,0,false]))).rejects.toThrow("draft_conflict");
    const rows=await asUser(userA,async()=>(await db.query("select profile_snapshot,meals from public.planner_drafts")).rows);
    expect(rows[0]).toEqual({profile_snapshot:profile,meals});
    await expect(asUser(userA,()=>db.exec("update public.planner_drafts set schema_version=2"))).rejects.toThrow("unsupported_plan_schema");
  });
  it("keeps actual CAS, explicit reopening, idempotent retry and ownership separate",async()=>{
    const saved=await asUser(userA,()=>rpc("save_daily_actual_v3",["2026-01-02",actual,protocol.dailyTarget,false,null]));
    expect(Number(saved.revision)).toBe(1);
    expect(await asUser(userA,()=>rpc("save_daily_actual_v3",["2026-01-02",actual,protocol.dailyTarget,false,null]))).toEqual(saved);
    await expect(asUser(userA,()=>rpc("save_daily_actual_v3",["2026-01-02",{...actual,habits:{steps:1}},protocol.dailyTarget,false,0]))).rejects.toThrow("actual_conflict");
    await asUser(userA,()=>rpc("save_daily_actual_v3",["2026-01-02",actual,protocol.dailyTarget,true,1]));
    await expect(asUser(userA,()=>rpc("save_daily_actual_v3",["2026-01-02",{...actual,habits:{steps:2}},protocol.dailyTarget,false,2]))).rejects.toThrow("reopen_actual_first");
    await asUser(userA,()=>rpc("save_daily_actual_v3",["2026-01-02",actual,protocol.dailyTarget,false,2]));
    expect(await asUser(userB,async()=>(await db.query("select * from public.daily_checkins")).rows)).toEqual([]);
    await expect(asUser(userA,()=>db.exec("update public.daily_checkins set actual='{"+'"version":2'+"}'"))).rejects.toThrow("unsupported_actual_schema");
  });
  it("rejects malformed JSON, unknown versions, impossible timestamps and negative amounts",async()=>{
    for(const bad of [{...actual,version:99},{...actual,bmrKcal:"Infinity"},{...actual,habits:{sleepHours:30}},{...actual,mealEvents:[{...actual.mealEvents[0],startedAt:"2026-01-02T15:00:00Z",endedAt:"2026-01-02T14:00:00Z"}]},{...actual,note:"x".repeat(262144)}]) await expect(asUser(userA,()=>rpc("save_daily_actual_v3",["2026-01-02",bad,null,false,null]))).rejects.toThrow();
    await expect(asUser(userA,()=>rpc("activate_plan_protocol_v1",[{...protocol,dailyTarget:{...protocol.dailyTarget,kcal:"2205"}},null]))).rejects.toThrow("invalid_protocol");
  });
  it("generates cycles idempotently, preserves logs and isolates schedule associations",async()=>{
    const rows=previewCycle(protocol,"2026-01-01",16,[],[]);
    const saved=await asUser(userA,()=>rpc("save_workout_schedules_v1",[rows,"generate"])) as unknown as Record<string,unknown>[];
    expect(saved).toHaveLength(16);
    expect(await asUser(userA,()=>rpc("save_workout_schedules_v1",[rows,"generate"]))).toEqual([]);
    const sets=setsFromPrescription(rows[0].prescription!,()=>crypto.randomUUID());
    sets[0]={...sets[0],completed:true,loadType:"bodyweight",reps:6,weightKg:0};
    const doc={session_date:"2026-01-01",split_label:"合成训练",status:"recorded",schedule_id:saved[0].id,sets:{version:2,sets}};
    await expect(asUser(userB,()=>rpc("save_workout_session_v2",[doc,null]))).rejects.toThrow("invalid_schedule_owner_or_date");
    const session=await asUser(userA,()=>rpc("save_workout_session_v2",[doc,null]));
    expect((session.sets as {sets:unknown[]}).sets[0]).toEqual(sets[0]);
    await expect(asUser(userA,()=>rpc("save_workout_schedules_v1",[[{...rows[0],id:saved[0].id,revision:1,status:"cancelled"}],"replace"]))).rejects.toThrow("existing_actual_protected");
    expect(await asUser(userA,async()=>(await db.query("select id from public.workout_sessions")).rows)).toHaveLength(1);
  });
  it("rolls back actual when the second half of completion fails",async()=>{
    await db.exec("create function public.synthetic_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic plan failure'; end $$; create trigger test_atomic before insert on public.daily_plans for each row execute function public.synthetic_failure();");
    try {await expect(asUser(userA,()=>rpc("complete_daily_record_v3",["2026-01-01",profile,meals,{},3,"test",[],actual,protocol.dailyTarget,true,null]))).rejects.toThrow("synthetic plan failure");
      const rows=await asUser(userA,async()=>(await db.query("select id from public.daily_checkins where plan_date='2026-01-01'")).rows);expect(rows).toEqual([]);
    }finally{await db.exec("drop trigger test_atomic on public.daily_plans; drop function public.synthetic_failure();");}
  });
  it("does not let an idempotent actual retry replace a different completed plan",async()=>{
    const args=["2026-01-01",profile,meals,{},3,"test",[],actual,protocol.dailyTarget,true,null];
    const first=await asUser(userA,()=>rpc("complete_daily_record_v3",args));
    expect(await asUser(userA,()=>rpc("complete_daily_record_v3",args))).toEqual(first);
    await expect(asUser(userA,()=>rpc("complete_daily_record_v3",[...args.slice(0,2),[{...meals[0],name:"changed"},...meals.slice(1)],...args.slice(3)]))).rejects.toThrow("completion_conflict_reopen_first");
    expect((await asUser(userA,async()=>(await db.query<{meals:unknown}>("select meals from public.daily_plans where plan_date='2026-01-01'")).rows))[0].meals).toEqual(meals);
  });
  it("derives V3 compatibility foods server-side and rejects invalid/null schedule inputs",async()=>{
    const written=await asUser(userA,()=>rpc("save_daily_actual_v3",["2026-01-03",{...actual,foods:[{foodId:"forged",totals:{kcal:9999}}]},protocol.dailyTarget,false,null]));
    expect((written.actual as {foods:unknown[]}).foods).toEqual([]);
    for(const bad of [null,{...protocol,mealSlots:[{...protocol.mealSlots[0],kind:null},...protocol.mealSlots.slice(1)]},{...protocol,eatingWindow:{start:"00:00",end:"00:00",endDayOffset:"1"}}]) await expect(asUser(userA,()=>rpc("activate_plan_protocol_v1",[bad,null]))).rejects.toThrow("invalid_protocol");
    const row=previewCycle(protocol,"2026-02-01",1,[],[])[0];
    for(const bad of [{...row,sessionDate:"2026-02-30"},{...row,timeZone:"invalid"},{...row,revision:-1},{...row,prescription:{exercises:[{exercise:"test",sets:-1}]},dayKind:"training"}]) await expect(asUser(userA,()=>rpc("save_workout_schedules_v1",[[bad],"generate"]))).rejects.toThrow();
  });
});
