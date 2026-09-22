// Synthetic HTTP fixture for browser flows, bound to loopback only. No real database or credentials.
import { createServer } from "node:http";
import { randomUUID, createHmac } from "node:crypto";
const user={id:"50000000-0000-4000-8000-000000000001",aud:"authenticated",role:"authenticated",email:"browser-fixture@example.test",created_at:"2026-01-01T00:00:00Z",app_metadata:{provider:"email",providers:["email"]},user_metadata:{}};
let tables; const now=()=>new Date().toISOString();
function reset(){tables={profiles:[{id:user.id,locale:"zh-CN",time_zone:"Asia/Shanghai",time_zone_mode:"fixed",week_starts_on:1,unit_system:"metric",energy_unit:"kcal",hour_cycle:"h23",theme:"light",heatmap_palette:"red-positive",reduce_motion:true,preferences:{}}],user_plan_protocols:[],planner_drafts:[],daily_plans:[],daily_checkins:[],workout_schedules:[],workout_sessions:[],body_logs:[],foods:[],food_overrides:[],planner_templates:[],deload_weeks:[]};}reset();
function session(){const exp=Math.floor(Date.now()/1000)+3600;const enc=x=>Buffer.from(JSON.stringify(x)).toString("base64url");const body=`${enc({alg:"HS256",typ:"JWT"})}.${enc({sub:user.id,aud:"authenticated",role:"authenticated",exp,iat:exp-3600,email:user.email,iss:"http://127.0.0.1:45432/auth/v1"})}`;return {access_token:`${body}.${createHmac("sha256","synthetic-ui-fixture-only").update(body).digest("base64url")}`,refresh_token:"synthetic-refresh",token_type:"bearer",expires_in:3600,expires_at:exp,user};}
const conflict=()=>{throw {code:"40001",message:"synthetic revision conflict"};};
function put(table,row,key){const old=tables[table].find(r=>r[key]===row[key]);const saved={id:old?.id??randomUUID(),created_at:old?.created_at??now(),updated_at:now(),...old,...row};tables[table]=tables[table].filter(r=>r[key]!==row[key]);tables[table].push(saved);return saved;}
function actual(p){const old=tables.daily_checkins.find(r=>r.plan_date===p.p_plan_date);if(old && old.revision!==p.p_expected_revision)conflict();return put("daily_checkins",{user_id:user.id,plan_date:p.p_plan_date,actual:p.p_actual,target:p.p_target,completed:p.p_completed,revision:(old?.revision??0)+1},"plan_date");}
function rpc(name,p){
  if(name==="tre_rpt_capabilities_v1")return 1;
  if(name==="nutrition_goals_capabilities_v1")return 2;
  if(name==="activate_plan_protocol_v1"){const existing=tables.user_plan_protocols.find(r=>r.id===p.p_config.id);if(existing){if(JSON.stringify(existing.config)!==JSON.stringify(p.p_config))conflict();return existing.config;}const old=tables.user_plan_protocols.at(-1);if((old?.config.id??null)!==p.p_expected_id)conflict();put("user_plan_protocols",{id:p.p_config.id,user_id:user.id,config:p.p_config,effective_from:p.p_config.effectiveFrom,schema_version:p.p_config.schemaVersion},"id");return p.p_config;}
  if(name.startsWith("save_planner_draft_v")){const old=tables.planner_drafts[0];if(old && p.p_expected_revision!==old.revision)conflict();const row=put("planner_drafts",{user_id:user.id,plan_date:p.p_plan_date,profile_snapshot:p.p_profile_snapshot,meals:p.p_meals,schema_version:p.p_schema_version,revision:(old?.revision??0)+1},"user_id");return [{revision:row.revision,updated_at:row.updated_at}];}
  if(name==="save_daily_actual_v3")return actual(p);
  if(name.startsWith("complete_daily_record_v")){const c=actual(p);put("daily_plans",{user_id:user.id,plan_date:p.p_plan_date,profile:p.p_profile,meals:p.p_meals,result:p.p_result,schema_version:p.p_plan_schema_version,algorithm_version:p.p_algorithm_version,integrity_flags:p.p_integrity_flags},"plan_date");return c;}
  if(name==="save_workout_schedules_v1"){const out=[];for(const s of p.p_schedules){const old=tables.workout_schedules.find(r=>r.session_date===s.sessionDate);if(old && p.p_mode==="generate")continue;if(old && old.revision!==s.revision)conflict();out.push(put("workout_schedules",{user_id:user.id,session_date:s.sessionDate,day_kind:s.dayKind,protocol_id:s.protocolId,prescription:s.prescription,planned_start:s.plannedStart,time_zone:s.timeZone,status:s.status,manually_edited:s.manuallyEdited,revision:(old?.revision??0)+1},"session_date"));}return out;}
  if(name==="save_workout_session_v2"){const old=tables.workout_sessions.find(r=>r.session_date===p.p_document.session_date);if(old && old.revision!==p.p_expected_revision)conflict();return put("workout_sessions",{...p.p_document,user_id:user.id,revision:(old?.revision??0)+1},"session_date");}
  throw {code:"PGRST202",message:`Unsupported fixture RPC: ${name}`};
}
createServer(async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","http://127.0.0.1:3300");res.setHeader("Access-Control-Allow-Headers","*");res.setHeader("Access-Control-Allow-Methods","GET,POST,PATCH,DELETE,OPTIONS");res.setHeader("Content-Type","application/json");if(req.method==="OPTIONS"){res.writeHead(204);res.end();return;}
  try{const url=new URL(req.url,"http://127.0.0.1:45432");let input="";for await(const c of req)input+=c;const payload=input?JSON.parse(input):{};
    if(url.pathname==="/fixture/reset"){reset();Object.assign(tables.profiles[0],payload.preferences??{});res.end("{}");return;}
    if(url.pathname==="/fixture/state"){res.end(JSON.stringify(tables));return;}
    if(url.pathname==="/auth/v1/token"){res.end(JSON.stringify(session()));return;}
    if(url.pathname==="/auth/v1/user"){res.end(JSON.stringify(user));return;}
    if(url.pathname.startsWith("/auth/")){res.end("{}");return;}
    if(url.pathname.startsWith("/rest/v1/rpc/")){res.end(JSON.stringify(rpc(url.pathname.split("/").at(-1),payload)));return;}
    const table=url.pathname.split("/").at(-1);if(!tables[table]){res.end("[]");return;}
    let rows=tables[table];for(const [key,filter] of url.searchParams){if(filter.startsWith("eq."))rows=rows.filter(r=>String(r[key])===filter.slice(3));if(filter.startsWith("gte."))rows=rows.filter(r=>r[key]>=filter.slice(4));if(filter.startsWith("lte."))rows=rows.filter(r=>r[key]<=filter.slice(4));}
    if(req.method==="POST"){const key=url.searchParams.get("on_conflict")?.split(",").at(-1)??"id";rows=[put(table,payload,key)];}
    if(req.method==="PATCH"){rows=rows.map(r=>put(table,{...r,...payload},"id"));}
    res.end(JSON.stringify(req.headers.accept?.includes("vnd.pgrst.object")?rows[0]??null:rows));
  }catch(e){res.writeHead(e.code==="40001"?409:400);res.end(JSON.stringify({code:e.code??"fixture_error",message:e.message??String(e)}));}
}).listen(45432,"127.0.0.1",()=>{process.stdout.write("Synthetic Supabase UI fixture ready on loopback:45432\n");});
