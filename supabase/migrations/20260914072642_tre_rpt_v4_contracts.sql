-- Incremental, opt-in contract. No historical plan/check-in/workout rows are rewritten.
create or replace function public.tre_rpt_capabilities_v1()
returns integer language sql stable security invoker set search_path = '' as $$ select 1 $$;
revoke all on function public.tre_rpt_capabilities_v1() from public, anon;
grant execute on function public.tre_rpt_capabilities_v1() to authenticated;

create or replace function public.validate_tre_protocol_v1(p jsonb)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare m jsonb; k text; totals jsonb; shares numeric; rules jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 32768
    or p->>'schemaVersion' is distinct from '1' or p->>'presetId' is distinct from 'eveningTreRptV4'
    or p->>'targetMode' is distinct from 'calibrated' or p->>'allocationMode' is distinct from 'explicitMacros'
    or not (p ?& array['id','version','effectiveFrom','timeZone','dailyTarget','eatingWindow','trainingStartLocal','preTrainingNoIntakeMinutes','mealSlots','trainingCycle','reviewRules','supersedesId','changeReason'])
    or coalesce(p->>'id','')='' or coalesce(p->>'effectiveFrom','') !~ '^\d{4}-\d{2}-\d{2}$'
    or not exists (select 1 from pg_timezone_names where name = p->>'timeZone')
    or coalesce(p->>'trainingStartLocal','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or jsonb_typeof(p->'preTrainingNoIntakeMinutes') <> 'number'
    or (p->>'preTrainingNoIntakeMinutes')::numeric not between 0 and 1440
    or (p->>'preTrainingNoIntakeMinutes')::numeric <> trunc((p->>'preTrainingNoIntakeMinutes')::numeric)
    or jsonb_typeof(p->'version') <> 'number' or (p->>'version')::numeric < 1
    or (p->>'version')::numeric <> trunc((p->>'version')::numeric)
    or jsonb_typeof(p->'changeReason') is distinct from 'string' or length(p->>'changeReason') > 500 then return false; end if;
  perform (p->>'id')::uuid, (p->>'effectiveFrom')::date;
  if p->'supersedesId' <> 'null'::jsonb then perform (p->>'supersedesId')::uuid; end if;
  if p->'trainingCycle'->>'id' is distinct from 'rptAlternate8DayV4'
    or p->'trainingCycle'->>'lengthDays' is distinct from '8' or p->'trainingCycle'->>'phase' is distinct from 'recovery'
    or coalesce(p->'trainingCycle'->>'anchorDate','') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  perform (p->'trainingCycle'->>'anchorDate')::date;
  totals := p->'dailyTarget';
  foreach k in array array['kcal','protein','carbs','fat'] loop
    if jsonb_typeof(totals->k) is distinct from 'number' or (totals->>k)::numeric not between 0 and 10000 then return false; end if;
  end loop;
  if (totals->>'kcal')::numeric <= 0 or abs((totals->>'kcal')::numeric - (totals->>'protein')::numeric*4 - (totals->>'carbs')::numeric*4 - (totals->>'fat')::numeric*9) > 0.000001 then return false; end if;
  if jsonb_typeof(p->'mealSlots') is distinct from 'array' or jsonb_array_length(p->'mealSlots') not between 1 and 12 then return false; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p->'mealSlots')) <> jsonb_array_length(p->'mealSlots') then return false; end if;
  for m in select value from jsonb_array_elements(p->'mealSlots') loop
    if not (m ?& array['id','name','kind','schedule','targetAllocation']) or coalesce(m->>'id','') = '' or jsonb_typeof(m->'name') is distinct from 'string' or length(m->>'name') > 80 or coalesce(m->>'kind','') not in ('main','snack') then return false; end if;
    foreach k in array array['protein','carbs','fat'] loop
      if jsonb_typeof(m->'targetAllocation'->k) is distinct from 'number' or (m->'targetAllocation'->>k)::numeric not between 0 and 1 then return false; end if;
    end loop;
  end loop;
  foreach k in array array['protein','carbs','fat'] loop
    select sum((value->'targetAllocation'->>k)::numeric) into shares from jsonb_array_elements(p->'mealSlots');
    if abs(shares-1) > 0.000001 then return false; end if;
  end loop;
  for m in select p->'eatingWindow' union all select value->'schedule' from jsonb_array_elements(p->'mealSlots') loop
    if coalesce(m->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(m->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or jsonb_typeof(m->'endDayOffset') is distinct from 'number' or coalesce(m->>'endDayOffset','') not in ('0','1') then return false; end if;
    if (m->>'end')::time - (m->>'start')::time + (m->>'endDayOffset')::integer * interval '1 day' <= interval '0'
      or (m->>'end')::time - (m->>'start')::time + (m->>'endDayOffset')::integer * interval '1 day' > interval '1 day' then return false; end if;
  end loop;
  rules := p->'reviewRules';
  foreach k in array array['minWeightsPerWeek','minIntakeDaysPerWeek','stableTargetDays','firstReviewDays'] loop
    if jsonb_typeof(rules->k) is distinct from 'number' or (rules->>k)::numeric <> trunc((rules->>k)::numeric) then return false; end if;
  end loop;
  if (rules->>'minWeightsPerWeek')::integer not between 1 and 7 or (rules->>'minIntakeDaysPerWeek')::integer not between 1 and 7
    or (rules->>'stableTargetDays')::integer not between 14 and 90 or (rules->>'firstReviewDays')::integer not between 14 and 90 then return false; end if;
  if p ? 'evidenceWindow' then
    if coalesce(p->'evidenceWindow'->>'from','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p->'evidenceWindow'->>'to','') !~ '^\d{4}-\d{2}-\d{2}$' or (p->'evidenceWindow'->>'from')::date>(p->'evidenceWindow'->>'to')::date then return false; end if;
  end if;
  return true;
exception when others then return false;
end $$;
revoke all on function public.validate_tre_protocol_v1(jsonb) from public, anon;
grant execute on function public.validate_tre_protocol_v1(jsonb) to authenticated;

create table public.user_plan_protocols (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version smallint not null default 1 check (schema_version = 1),
  preset_id text not null check (preset_id = 'eveningTreRptV4'),
  config jsonb not null check (public.validate_tre_protocol_v1(config)),
  effective_from date not null,
  created_at timestamptz not null default now(),
  supersedes_id uuid,
  change_reason text not null check (length(change_reason) <= 500),
  unique (user_id, id), unique (user_id, effective_from),
  foreign key (user_id, supersedes_id) references public.user_plan_protocols(user_id, id),
  check ((config->>'id')::uuid = id and (config->>'effectiveFrom')::date = effective_from
    and config->>'changeReason' = change_reason and (config->>'supersedesId')::uuid is not distinct from supersedes_id)
);
alter table public.user_plan_protocols enable row level security;
revoke all on public.user_plan_protocols from public, anon, authenticated;
grant select on public.user_plan_protocols to authenticated;
grant all on public.user_plan_protocols to service_role;
create policy "read own immutable protocols" on public.user_plan_protocols for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own protocols" on public.user_plan_protocols for insert to authenticated with check ((select auth.uid()) = user_id);

create or replace function public.activate_plan_protocol_v1(p_config jsonb, p_expected_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); previous public.user_plan_protocols%rowtype; existing public.user_plan_protocols%rowtype;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not public.validate_tre_protocol_v1(p_config) then raise exception 'invalid_protocol' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
  select * into existing from public.user_plan_protocols where user_id=u and id=(p_config->>'id')::uuid;
  if found then
    if existing.config = p_config then return existing.config; end if;
    raise exception 'protocol_conflict' using errcode='40001';
  end if;
  select * into previous from public.user_plan_protocols where user_id=u order by effective_from desc limit 1;
  if previous.id is distinct from p_expected_id or (p_config->>'supersedesId')::uuid is distinct from p_expected_id
    or (p_config->>'version')::integer <> coalesce((previous.config->>'version')::integer,0)+1
    or (previous.id is not null and (p_config->>'effectiveFrom')::date <= previous.effective_from) then raise exception 'protocol_conflict' using errcode='40001'; end if;
  insert into public.user_plan_protocols(id,user_id,preset_id,config,effective_from,supersedes_id,change_reason)
  values ((p_config->>'id')::uuid,u,p_config->>'presetId',p_config,(p_config->>'effectiveFrom')::date,p_expected_id,p_config->>'changeReason');
  return p_config;
end $$;
revoke all on function public.activate_plan_protocol_v1(jsonb,uuid) from public, anon;
grant execute on function public.activate_plan_protocol_v1(jsonb,uuid) to authenticated;

create or replace function public.validate_plan_document_v3(p_date date,p_profile jsonb,p_meals jsonb,p_user uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare m jsonb; e jsonb; k text; snapshot jsonb;
begin
  if p_date is null or p_profile->>'planDate' is distinct from p_date::text
    or jsonb_typeof(p_meals) is distinct from 'array' or jsonb_array_length(p_meals) > 12
    or octet_length(p_profile::text)+octet_length(p_meals::text) > 262144 then raise exception 'invalid_plan_document' using errcode='22023'; end if;
  if p_profile->>'targetMode' = 'calibrated' then
    snapshot := p_profile->'protocolSnapshot';
    if not public.validate_tre_protocol_v1(snapshot) or p_profile->>'allocationMode' is distinct from 'explicitMacros'
      or not exists (select 1 from public.user_plan_protocols where user_id=p_user and id=(snapshot->>'id')::uuid and config=snapshot)
      or (snapshot->>'effectiveFrom')::date > p_date then raise exception 'invalid_protocol_reference' using errcode='42501'; end if;
  end if;
  for m in select value from jsonb_array_elements(p_meals) loop
    if jsonb_typeof(m->'entries') is distinct from 'array' or jsonb_array_length(m->'entries') > 100
      or jsonb_typeof(m->'ratio') is distinct from 'number' or (m->>'ratio')::numeric < 0
      or coalesce(m->>'kind','main') not in ('main','snack') then raise exception 'invalid_meal_document' using errcode='22023'; end if;
    for e in select value from jsonb_array_elements(m->'entries') loop
      foreach k in array array['grams','minGrams','maxGrams'] loop
        if (k='grams' or e->k is not null and e->k <> 'null'::jsonb) and (jsonb_typeof(e->k) is distinct from 'number' or (e->>k)::numeric < 0) then raise exception 'invalid_food_amount' using errcode='22023'; end if;
      end loop;
      if e->>'minGrams' is not null and e->>'maxGrams' is not null and (e->>'minGrams')::numeric>(e->>'maxGrams')::numeric then raise exception 'invalid_food_bounds' using errcode='22023'; end if;
      if e ? 'foodSnapshot' then
        if e->'foodSnapshot'->>'version' is distinct from '1' then raise exception 'unsupported_food_snapshot' using errcode='22023'; end if;
        foreach k in array array['kcalPer100g','proteinPer100g','carbsPer100g','fatPer100g'] loop
          if jsonb_typeof(e->'foodSnapshot'->k) is distinct from 'number' or (e->'foodSnapshot'->>k)::numeric<0 then raise exception 'invalid_food_snapshot' using errcode='22023'; end if;
        end loop;
      end if;
    end loop;
    if p_profile->>'allocationMode'='explicitMacros' then
      foreach k in array array['protein','carbs','fat'] loop
        if jsonb_typeof(m->'targetAllocation'->k) is distinct from 'number' or (m->'targetAllocation'->>k)::numeric not between 0 and 1 then raise exception 'invalid_allocation' using errcode='22023'; end if;
      end loop;
    end if;
    if m ? 'schedule' then
      if coalesce(m->'schedule'->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(m->'schedule'->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(m->'schedule'->>'endDayOffset','') not in ('0','1') then raise exception 'invalid_meal_time' using errcode='22023'; end if;
    end if;
  end loop;
  if p_profile->>'allocationMode'='explicitMacros' then
    foreach k in array array['protein','carbs','fat'] loop
      if abs(coalesce((select sum((value->'targetAllocation'->>k)::numeric) from jsonb_array_elements(p_meals)),0)-1) > 0.000001 then raise exception 'invalid_allocation_sum' using errcode='22023'; end if;
    end loop;
  end if;
end $$;
revoke all on function public.validate_plan_document_v3(date,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.validate_plan_document_v3(date,jsonb,jsonb,uuid) to authenticated;

create or replace function public.save_planner_draft_v3(p_plan_date date,p_profile_snapshot jsonb,p_meals jsonb,p_schema_version smallint default 3,p_expected_revision bigint default null,p_force boolean default false)
returns table(revision bigint,updated_at timestamptz) language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); r bigint; t timestamptz;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_schema_version <> 3 or p_force then raise exception 'invalid_draft_contract' using errcode='22023'; end if;
  perform public.validate_plan_document_v3(p_plan_date,p_profile_snapshot,p_meals,u);
  if p_expected_revision is null then
    insert into public.planner_drafts as d(user_id,plan_date,profile_snapshot,meals,schema_version)
    values(u,p_plan_date,p_profile_snapshot,p_meals,3) on conflict(user_id) do nothing returning d.revision,d.updated_at into r,t;
  else
    update public.planner_drafts d set plan_date=p_plan_date,profile_snapshot=p_profile_snapshot,meals=p_meals,schema_version=3,revision=d.revision+1
    where d.user_id=u and d.revision=p_expected_revision and d.schema_version in (1,2,3) returning d.revision,d.updated_at into r,t;
  end if;
  if r is null then raise exception 'draft_conflict' using errcode='40001'; end if;
  return query select r,t;
end $$;
revoke all on function public.save_planner_draft_v3(date,jsonb,jsonb,smallint,bigint,boolean) from public,anon;
grant execute on function public.save_planner_draft_v3(date,jsonb,jsonb,smallint,bigint,boolean) to authenticated;

-- Validators are shared by RPCs and table guards; JSON numeric strings are rejected.
create function public.valid_tre_totals_v1(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;
begin
  if jsonb_typeof(p) is distinct from 'object' then return false; end if;
  foreach k in array array['kcal','protein','carbs','fat'] loop
    if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric < 0 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create function public.valid_tre_clock_v1(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare d interval;
begin
  if coalesce(p->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or jsonb_typeof(p->'endDayOffset') is distinct from 'number' or p->>'endDayOffset' not in ('0','1') then return false; end if;
  d := (p->>'end')::time - (p->>'start')::time + (p->>'endDayOffset')::integer * interval '1 day';
  return d > interval '0' and d <= interval '1 day';
exception when others then return false;
end $$;

create function public.validate_actual_v3(p jsonb,p_date date) returns void language plpgsql stable set search_path='' as $$
declare e jsonb; f jsonb; k text; h jsonb; has_calories boolean; d date; v text := p->>'version';
begin
  if v is null or v not in ('2','3') or jsonb_typeof(p->'version') is distinct from 'number' or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>262144 or p_date is null then raise exception 'invalid_actual_document' using errcode='22023'; end if;
  if jsonb_typeof(p->'exercises') is distinct from 'array' or jsonb_array_length(p->'exercises')>100 then raise exception 'invalid_exercises' using errcode='22023'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p->'exercises')) <> jsonb_array_length(p->'exercises') then raise exception 'duplicate_exercise' using errcode='22023'; end if;
  for e in select value from jsonb_array_elements(p->'exercises') loop
    if coalesce(e->>'id','')='' or coalesce(e->>'name','')='' or length(e->>'name')>80 or jsonb_typeof(e->'kcal') is distinct from 'number' or (e->>'kcal')::numeric not between 0 and 10000 then raise exception 'invalid_exercise' using errcode='22023'; end if;
  end loop;
  foreach k in array array['bmrKcal','activityKcal'] loop
    if jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric not between 0 and 10000 then raise exception 'invalid_energy_estimate' using errcode='22023'; end if;
  end loop;
  h:=p->'habits';
  foreach k in array array['vegetableGrams','waterLiters','steps','postWorkoutCarbs','postWorkoutProtein','sleepHours','hungerLevel','moodLevel'] loop
    if h ? k and h->k <> 'null'::jsonb then
      if jsonb_typeof(h->k) is distinct from 'number' or (h->>k)::numeric not between 0 and 100000
        or (k='sleepHours' and (h->>k)::numeric>24) or (k in ('hungerLevel','moodLevel') and (h->>k)::numeric>5) then raise exception 'invalid_habit' using errcode='22023'; end if;
    end if;
  end loop;
  if v='2' then
    if jsonb_typeof(p->'foods') is distinct from 'array' then raise exception 'invalid_legacy_foods' using errcode='22023'; end if;
    for f in select value from jsonb_array_elements(p->'foods') loop
      if not public.valid_tre_totals_v1(f->'totals') or jsonb_typeof(f->'grams') is distinct from 'number' or (f->>'grams')::numeric<0 then raise exception 'invalid_legacy_food' using errcode='22023'; end if;
    end loop;
    if p ? 'totalsSnapshot' and not public.valid_tre_totals_v1(p->'totalsSnapshot') then raise exception 'invalid_legacy_totals' using errcode='22023'; end if;
    return;
  end if;
  if jsonb_typeof(p->'intakeComplete') is distinct from 'boolean' or jsonb_typeof(p->'mealEvents') is distinct from 'array' or jsonb_array_length(p->'mealEvents')>100 then raise exception 'invalid_meal_events' using errcode='22023'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p->'mealEvents')) <> jsonb_array_length(p->'mealEvents') then raise exception 'duplicate_meal_event' using errcode='22023'; end if;
  if p ? 'legacyActual' then
    if p->'legacyActual'->>'version' is distinct from '2' then raise exception 'invalid_legacy_version' using errcode='22023'; end if;
    perform public.validate_actual_v3(p->'legacyActual',p_date);
  end if;
  for e in select value from jsonb_array_elements(p->'mealEvents') loop
    if coalesce(e->>'id','')='' or length(e->>'id')>100 or coalesce(e->>'entryMethod','') not in ('measured','estimated','confirmed_from_plan')
      or not exists(select 1 from pg_timezone_names where name=e->>'timeZone') or jsonb_typeof(e->'containsCalories') is distinct from 'boolean'
      or jsonb_typeof(e->'actualFoodEntries') is distinct from 'array' or jsonb_array_length(e->'actualFoodEntries')>100
      or coalesce(length(e->>'note'),0)>500 then raise exception 'invalid_meal_event' using errcode='22023'; end if;
    foreach k in array array['startedAt','endedAt'] loop
      if e->>k is not null then
        if e->>k !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then raise exception 'instant_required' using errcode='22023'; end if;
        d:=((e->>k)::timestamptz at time zone (e->>'timeZone'))::date;
        if d<p_date or d>p_date+1 then raise exception 'event_date_out_of_range' using errcode='22023'; end if;
      end if;
    end loop;
    if e->>'startedAt' is not null and e->>'endedAt' is not null and (e->>'startedAt')::timestamptz>(e->>'endedAt')::timestamptz then raise exception 'invalid_event_order' using errcode='22023'; end if;
    if (select count(distinct value->>'id') from jsonb_array_elements(e->'actualFoodEntries')) <> jsonb_array_length(e->'actualFoodEntries') then raise exception 'duplicate_actual_food' using errcode='22023'; end if;
    has_calories:=false;
    for f in select value from jsonb_array_elements(e->'actualFoodEntries') loop
      if coalesce(f->>'id','')='' or coalesce(f->>'foodId','')='' or jsonb_typeof(f->'grams') is distinct from 'number' or (f->>'grams')::numeric<0
        or coalesce(f->>'energyBasis','') not in ('macros','label') or f->'foodSnapshot'->>'version' is distinct from '1'
        or coalesce(f->'foodSnapshot'->>'name','')='' then raise exception 'invalid_actual_food' using errcode='22023'; end if;
      foreach k in array array['kcalPer100g','proteinPer100g','carbsPer100g','fatPer100g'] loop
        if jsonb_typeof(f->'foodSnapshot'->k) is distinct from 'number' or (f->'foodSnapshot'->>k)::numeric<0 then raise exception 'invalid_snapshot_nutrition' using errcode='22023'; end if;
        if (f->>'grams')::numeric>0 and (k<>'kcalPer100g' or f->>'energyBasis'='label') and (f->'foodSnapshot'->>k)::numeric>0 then has_calories:=true; end if;
      end loop;
    end loop;
    if jsonb_array_length(e->'actualFoodEntries')>0 and (e->>'containsCalories')::boolean is distinct from has_calories then raise exception 'calorie_flag_mismatch' using errcode='22023'; end if;
  end loop;
  h:=p->'recovery';
  foreach k in array array['fatigue','footPain'] loop
    if h ? k and h->k <> 'null'::jsonb and (jsonb_typeof(h->k) is distinct from 'number' or (h->>k)::numeric<0 or (h->>k)::numeric>case when k='fatigue' then 5 else 10 end) then raise exception 'invalid_recovery_score' using errcode='22023'; end if;
  end loop;
  if h->>'trainingTolerance' is not null and h->>'trainingTolerance' not in ('good','limited') or h ? 'persistentSymptoms' and jsonb_typeof(h->'persistentSymptoms') not in ('boolean','null') then raise exception 'invalid_recovery' using errcode='22023'; end if;
end $$;

create function public.canonical_actual_v3(p jsonb) returns jsonb language sql immutable set search_path='' as $$
  select case when p->>'version'<>'3' then p else jsonb_set(p,'{foods}',coalesce(p->'legacyActual'->'foods','[]'::jsonb)||coalesce((
    select jsonb_agg(jsonb_build_object('foodId',f->>'foodId','name',f->'foodSnapshot'->>'name','grams',f->'grams','totals',jsonb_build_object(
      'protein',(f->'foodSnapshot'->>'proteinPer100g')::numeric*(f->>'grams')::numeric/100,
      'carbs',(f->'foodSnapshot'->>'carbsPer100g')::numeric*(f->>'grams')::numeric/100,
      'fat',(f->'foodSnapshot'->>'fatPer100g')::numeric*(f->>'grams')::numeric/100,
      'kcal',(case when f->>'energyBasis'='label' then (f->'foodSnapshot'->>'kcalPer100g')::numeric else (f->'foodSnapshot'->>'proteinPer100g')::numeric*4+(f->'foodSnapshot'->>'carbsPer100g')::numeric*4+(f->'foodSnapshot'->>'fatPer100g')::numeric*9 end)*(f->>'grams')::numeric/100)))
      from jsonb_array_elements(p->'mealEvents') e cross join lateral jsonb_array_elements(e->'actualFoodEntries') f
  ),'[]'::jsonb)) end
$$;
revoke all on function public.canonical_actual_v3(jsonb) from public,anon;
grant execute on function public.canonical_actual_v3(jsonb) to authenticated;

alter table public.daily_checkins add column revision bigint not null default 1 check(revision>0);
create function public.save_daily_actual_v3(p_plan_date date,p_actual jsonb,p_target jsonb,p_completed boolean,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); old public.daily_checkins%rowtype; saved public.daily_checkins%rowtype;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  perform public.validate_actual_v3(p_actual,p_plan_date);
  p_actual:=public.canonical_actual_v3(p_actual);
  if p_completed is null or p_target is not null and not public.valid_tre_totals_v1(p_target) then raise exception 'invalid_actual_target' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||p_plan_date::text,1));
  select * into old from public.daily_checkins where user_id=u and plan_date=p_plan_date for update;
  if found then
    if old.actual=p_actual and old.target is not distinct from p_target and old.completed=p_completed then return to_jsonb(old); end if;
    if old.revision is distinct from p_expected_revision then raise exception 'actual_conflict' using errcode='40001'; end if;
    if old.completed and (p_completed or old.actual is distinct from p_actual or old.target is distinct from p_target) then raise exception 'reopen_actual_first' using errcode='22023'; end if;
    if coalesce((old.actual->>'version')::integer,1)>3 or coalesce((old.actual->>'version')::integer,1)>(p_actual->>'version')::integer then raise exception 'unsupported_actual_version' using errcode='22023'; end if;
    update public.daily_checkins set actual=p_actual,target=p_target,completed=p_completed,revision=revision+1 where user_id=u and id=old.id returning * into saved;
  else
    if p_expected_revision is not null then raise exception 'actual_conflict' using errcode='40001'; end if;
    insert into public.daily_checkins(user_id,plan_date,actual,target,completed) values(u,p_plan_date,p_actual,p_target,p_completed) returning * into saved;
  end if;
  return to_jsonb(saved);
end $$;

create function public.complete_daily_record_v3(p_plan_date date,p_profile jsonb,p_meals jsonb,p_result jsonb,p_plan_schema_version smallint,p_algorithm_version text,p_integrity_flags text[],p_actual jsonb,p_target jsonb,p_completed boolean default true,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); saved jsonb; prior public.daily_checkins%rowtype; plan public.daily_plans%rowtype;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_plan_schema_version not in (2,3) or p_plan_schema_version is null or jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>262144 then raise exception 'invalid_plan_document' using errcode='22023'; end if;
  if p_profile->>'planDate' is distinct from p_plan_date::text or jsonb_typeof(p_meals) is distinct from 'array' then raise exception 'invalid_plan_document' using errcode='22023'; end if;
  if p_plan_schema_version=3 then perform public.validate_plan_document_v3(p_plan_date,p_profile,p_meals,u); end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||p_plan_date::text,1));
  select * into prior from public.daily_checkins where user_id=u and plan_date=p_plan_date for update;
  perform public.validate_actual_v3(p_actual,p_plan_date);
  p_actual:=public.canonical_actual_v3(p_actual);
  if prior.completed and p_completed then
    select * into plan from public.daily_plans where user_id=u and plan_date=p_plan_date;
    if prior.actual=p_actual and prior.target is not distinct from p_target and plan.profile=p_profile and plan.meals=p_meals and plan.result=p_result and plan.schema_version=p_plan_schema_version then return to_jsonb(prior); end if;
    raise exception 'completion_conflict_reopen_first' using errcode='40001';
  end if;
  -- CAS and actual validation run first. Any later plan error rolls the same transaction back.
  saved:=public.save_daily_actual_v3(p_plan_date,p_actual,p_target,p_completed,p_expected_revision);
  insert into public.daily_plans(user_id,plan_date,profile,meals,result,schema_version,algorithm_version,integrity_flags)
    values(u,p_plan_date,p_profile,p_meals,p_result,p_plan_schema_version,p_algorithm_version,coalesce(p_integrity_flags,'{}'))
    on conflict(user_id,plan_date) do update set profile=excluded.profile,meals=excluded.meals,result=excluded.result,schema_version=excluded.schema_version,algorithm_version=excluded.algorithm_version,integrity_flags=excluded.integrity_flags;
  return saved;
end $$;

create table public.workout_schedules (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,day_kind text not null check(day_kind in ('training','rest')),protocol_id uuid,
  prescription jsonb,planned_start text,time_zone text not null,status text not null default 'planned' check(status in ('planned','skipped','cancelled')),
  revision bigint not null default 1 check(revision>0),manually_edited boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,session_date),unique(user_id,id),foreign key(user_id,protocol_id) references public.user_plan_protocols(user_id,id),
  check(planned_start is null or planned_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check((day_kind='rest' and prescription is null and planned_start is null) or (day_kind='training' and prescription is not null))
);
alter table public.workout_schedules enable row level security;
revoke all on public.workout_schedules from public,anon,authenticated;
grant select on public.workout_schedules to authenticated;
grant all on public.workout_schedules to service_role;
create policy "read own schedules" on public.workout_schedules for select to authenticated using((select auth.uid())=user_id);

alter table public.workout_sessions add column schedule_id uuid,add column status text not null default 'legacy_unknown' check(status in ('recorded','legacy_unknown')),add column revision bigint not null default 1 check(revision>0),
  add constraint workout_schedule_owner foreign key(user_id,schedule_id) references public.workout_schedules(user_id,id);

create function public.save_workout_schedules_v1(p_schedules jsonb,p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s jsonb; ex jsonb; pres jsonb; k text; old public.workout_schedules%rowtype; saved public.workout_schedules%rowtype; output jsonb:='[]'; d date;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_mode is null or p_mode not in ('generate','replace') or jsonb_typeof(p_schedules) is distinct from 'array' or jsonb_array_length(p_schedules)>72 or octet_length(p_schedules::text)>1048576 then raise exception 'invalid_schedule_batch' using errcode='22023'; end if;
  if (select count(distinct value->>'sessionDate') from jsonb_array_elements(p_schedules))<>jsonb_array_length(p_schedules) then raise exception 'duplicate_schedule_date' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,2));
  for s in select value from jsonb_array_elements(p_schedules) order by value->>'sessionDate' loop
    if coalesce(s->>'sessionDate','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(s->>'dayKind','') not in ('training','rest') or coalesce(s->>'status','') not in ('planned','skipped','cancelled')
      or not exists(select 1 from pg_timezone_names where name=s->>'timeZone') or jsonb_typeof(s->'revision') is distinct from 'number'
      or (s->>'revision')::numeric<0 or (s->>'revision')::numeric<>trunc((s->>'revision')::numeric) or jsonb_typeof(s->'manuallyEdited') is distinct from 'boolean' then raise exception 'invalid_schedule' using errcode='22023'; end if;
    d:=(s->>'sessionDate')::date;
    if s->>'plannedStart' is not null and s->>'plannedStart' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_training_time' using errcode='22023'; end if;
    if s->>'protocolId' is not null and not exists(select 1 from public.user_plan_protocols where user_id=u and id=(s->>'protocolId')::uuid and effective_from<=d) then raise exception 'invalid_protocol_owner' using errcode='42501'; end if;
    if s->>'dayKind'='training' then
      if jsonb_typeof(s->'prescription'->'exercises') is distinct from 'array' or jsonb_array_length(s->'prescription'->'exercises') not between 1 and 100 then raise exception 'invalid_training_prescription' using errcode='22023'; end if;
      for ex in select value from jsonb_array_elements(s->'prescription'->'exercises') loop
        if coalesce(ex->>'exercise','')='' or jsonb_typeof(ex->'sets') is distinct from 'number' or (ex->>'sets')::numeric not between 1 and 100 or (ex->>'sets')::numeric<>trunc((ex->>'sets')::numeric) then raise exception 'invalid_prescribed_sets' using errcode='22023'; end if;
        if ex ? 'prescription' then
          if jsonb_typeof(ex->'prescription') is distinct from 'array' or jsonb_array_length(ex->'prescription')<>(ex->>'sets')::integer then raise exception 'invalid_prescription_count' using errcode='22023'; end if;
          for pres in select value from jsonb_array_elements(ex->'prescription') loop
            if jsonb_typeof(pres->'targetRir') is distinct from 'number' or (pres->>'targetRir')::numeric not between 0 and 10 or coalesce(pres->>'kind','') not in ('rpt','straight','core') then raise exception 'invalid_set_prescription' using errcode='22023'; end if;
          end loop;
        end if;
      end loop;
    end if;
    select * into old from public.workout_schedules where user_id=u and session_date=d for update;
    if p_mode='generate' and (old.id is not null or exists(select 1 from public.workout_sessions where user_id=u and session_date=d)) then continue; end if;
    if old.id is not null and old.day_kind=s->>'dayKind' and old.protocol_id is not distinct from (s->>'protocolId')::uuid and old.prescription is not distinct from nullif(s->'prescription','null'::jsonb) and old.planned_start is not distinct from s->>'plannedStart' and old.time_zone=s->>'timeZone' and old.status=s->>'status' and old.manually_edited=(s->>'manuallyEdited')::boolean then output:=output||jsonb_build_array(to_jsonb(old)); continue; end if;
    if exists(select 1 from public.workout_sessions where user_id=u and session_date=d) then raise exception 'existing_actual_protected' using errcode='40001'; end if;
    if coalesce(old.revision,0)<>(s->>'revision')::bigint or old.id is not null and old.id::text is distinct from s->>'id' then raise exception 'schedule_conflict' using errcode='40001'; end if;
    insert into public.workout_schedules(user_id,session_date,day_kind,protocol_id,prescription,planned_start,time_zone,status,manually_edited)
    values(u,d,s->>'dayKind',(s->>'protocolId')::uuid,nullif(s->'prescription','null'::jsonb),s->>'plannedStart',s->>'timeZone',s->>'status',(s->>'manuallyEdited')::boolean)
    on conflict(user_id,session_date) do update set day_kind=excluded.day_kind,protocol_id=excluded.protocol_id,prescription=excluded.prescription,planned_start=excluded.planned_start,time_zone=excluded.time_zone,status=excluded.status,manually_edited=excluded.manually_edited,revision=public.workout_schedules.revision+1,updated_at=now()
    returning * into saved;
    output:=output||jsonb_build_array(to_jsonb(saved));
  end loop;
  return output;
end $$;

create function public.save_workout_session_v2(p_document jsonb,p_expected_revision bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p jsonb:=p_document; s jsonb; k text; old public.workout_sessions%rowtype; saved public.workout_sessions%rowtype; d date;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if octet_length(p::text)>262144 or p->'sets'->>'version' is distinct from '2' or jsonb_typeof(p->'sets'->'sets') is distinct from 'array' or jsonb_array_length(p->'sets'->'sets')>500
    or coalesce(p->>'session_date','') !~ '^\d{4}-\d{2}-\d{2}$' or p->>'status' is distinct from 'recorded' or coalesce(length(p->>'note'),0)>2000 then raise exception 'invalid_workout' using errcode='22023'; end if;
  d:=(p->>'session_date')::date;
  foreach k in array array['bodyweight_kg','recovery'] loop
    if p->>k is not null and (jsonb_typeof(p->k) is distinct from 'number' or (p->>k)::numeric<=0 or (p->>k)::numeric>case when k='recovery' then 5 else 1000 end) then raise exception 'invalid_workout_metadata' using errcode='22023'; end if;
  end loop;
  if p->>'schedule_id' is not null and not exists(select 1 from public.workout_schedules where user_id=u and id=(p->>'schedule_id')::uuid and session_date=d and day_kind='training') then raise exception 'invalid_schedule_owner_or_date' using errcode='42501'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p->'sets'->'sets'))<>jsonb_array_length(p->'sets'->'sets') then raise exception 'duplicate_workout_set' using errcode='22023'; end if;
  for s in select value from jsonb_array_elements(p->'sets'->'sets') loop
    if coalesce(s->>'id','')='' or coalesce(s->>'exercise','')='' or coalesce(s->>'muscleGroup','') not in ('chest','back','quads','hamstrings','glutes','shoulders','biceps','triceps','calves','abs') then raise exception 'invalid_workout_set' using errcode='22023'; end if;
    foreach k in array array['weightKg','reps'] loop
      if not (s ? k) or jsonb_typeof(s->k) not in ('number','null') or (s->>k)::numeric<0 then raise exception 'invalid_actual_load' using errcode='22023'; end if;
    end loop;
    if (s->>'reps')::numeric<>trunc((s->>'reps')::numeric) or s->>'rir' is not null and (jsonb_typeof(s->'rir') is distinct from 'number' or (s->>'rir')::numeric not between 0 and 10)
      or s->>'durationSeconds' is not null and (jsonb_typeof(s->'durationSeconds') is distinct from 'number' or (s->>'durationSeconds')::numeric not between 0 and 86400)
      or s->>'loadType' is not null and s->>'loadType' not in ('external','bodyweight','weighted_bodyweight','assisted','timed')
      or s->>'side' is not null and s->>'side' not in ('both','left','right') or jsonb_typeof(s->'isWarmup') is distinct from 'boolean'
      or s ? 'completed' and jsonb_typeof(s->'completed') is distinct from 'boolean' then raise exception 'invalid_actual_set_fields' using errcode='22023'; end if;
    if s->>'completed'='true' and ((case when s->>'loadType'='timed' then coalesce((s->>'durationSeconds')::numeric,0) else coalesce((s->>'reps')::numeric,0) end)<=0 or s->>'loadType'='external' and s->>'weightKg' is null) then raise exception 'completed_set_needs_actual' using errcode='22023'; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(u::text||d::text,3));
  select * into old from public.workout_sessions where user_id=u and session_date=d for update;
  if old.id is not null then
    if old.sets=p->'sets' and old.split_label=p->>'split_label' and old.bodyweight_kg is not distinct from (p->>'bodyweight_kg')::numeric and old.recovery is not distinct from (p->>'recovery')::smallint and old.note is not distinct from p->>'note' and old.schedule_id is not distinct from (p->>'schedule_id')::uuid then return to_jsonb(old); end if;
    if old.revision is distinct from p_expected_revision then raise exception 'workout_conflict' using errcode='40001'; end if;
    if coalesce((old.sets->>'version')::integer,1)>2 then raise exception 'unsupported_workout_version' using errcode='22023'; end if;
    update public.workout_sessions set split_label=p->>'split_label',bodyweight_kg=(p->>'bodyweight_kg')::numeric,recovery=(p->>'recovery')::smallint,note=p->>'note',sets=p->'sets',status='recorded',schedule_id=(p->>'schedule_id')::uuid,revision=revision+1 where user_id=u and id=old.id returning * into saved;
  else
    if p_expected_revision is not null then raise exception 'workout_conflict' using errcode='40001'; end if;
    insert into public.workout_sessions(user_id,session_date,split_label,bodyweight_kg,recovery,note,sets,status,schedule_id)
      values(u,d,p->>'split_label',(p->>'bodyweight_kg')::numeric,(p->>'recovery')::smallint,p->>'note',p->'sets','recorded',(p->>'schedule_id')::uuid) returning * into saved;
  end if;
  return to_jsonb(saved);
end $$;

-- A stale client must never downgrade newer documents, including through the old RPCs.
create function public.guard_tre_document_write_v1() returns trigger language plpgsql security invoker set search_path='' as $$
declare old_version integer:=0; new_version integer; profile_doc jsonb; h jsonb;
begin
  if tg_table_name in ('daily_plans','planner_drafts') then
    new_version:=new.schema_version;
    if tg_op='UPDATE' then old_version:=old.schema_version; end if;
    if new_version not in (1,2,3) or old_version>3 or new_version<old_version then raise exception 'unsupported_plan_schema' using errcode='22023'; end if;
    if new_version=3 then
      if tg_table_name='daily_plans' then profile_doc:=new.profile; else profile_doc:=new.profile_snapshot; end if;
      perform public.validate_plan_document_v3(new.plan_date,profile_doc,new.meals,new.user_id);
      if tg_table_name='planner_drafts' and current_user in ('authenticated','anon') then raise exception 'use_revision_rpc' using errcode='42501'; end if;
      if profile_doc->>'allocationMode'='explicitMacros' and jsonb_array_length(new.meals)=0 then raise exception 'missing_macro_allocation' using errcode='22023'; end if;
      for h in select value->'schedule' from jsonb_array_elements(new.meals) where value ? 'schedule' loop
        if not public.valid_tre_clock_v1(h) then raise exception 'invalid_meal_schedule' using errcode='22023'; end if;
      end loop;
      h:=profile_doc->'scheduleOverride';
      if h ? 'eatingWindow' and not public.valid_tre_clock_v1(h->'eatingWindow') or h->>'trainingStartLocal' is not null and h->>'trainingStartLocal' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or h ? 'preTrainingNoIntakeMinutes' and (jsonb_typeof(h->'preTrainingNoIntakeMinutes') is distinct from 'number' or (h->>'preTrainingNoIntakeMinutes')::numeric not between 0 and 1440 or (h->>'preTrainingNoIntakeMinutes')::numeric<>trunc((h->>'preTrainingNoIntakeMinutes')::numeric)) then raise exception 'invalid_day_schedule_override' using errcode='22023'; end if;
    end if;
  elsif tg_table_name='daily_checkins' then
    new_version:=coalesce((new.actual->>'version')::integer,1);
    if tg_op='UPDATE' then old_version:=coalesce((old.actual->>'version')::integer,1); end if;
    if new_version not in (1,2,3) or old_version>3 or new_version<old_version then raise exception 'unsupported_actual_schema' using errcode='22023'; end if;
    if new_version=3 then
      if current_user in ('authenticated','anon') then raise exception 'use_revision_rpc' using errcode='42501'; end if;
      perform public.validate_actual_v3(new.actual,new.plan_date);
    end if;
    if tg_op='UPDATE' and current_user in ('authenticated','anon') then new.revision:=old.revision+1; end if;
  elsif tg_table_name='workout_sessions' then
    new_version:=coalesce((new.sets->>'version')::integer,1);
    if tg_op='UPDATE' then old_version:=coalesce((old.sets->>'version')::integer,1); end if;
    if new_version not in (1,2) or old_version>2 or new_version<old_version then raise exception 'unsupported_workout_schema' using errcode='22023'; end if;
    if (new_version=2 or new.status='recorded') and current_user in ('authenticated','anon') then raise exception 'use_revision_rpc' using errcode='42501'; end if;
    if tg_op='UPDATE' and current_user in ('authenticated','anon') then new.revision:=old.revision+1; end if;
  end if;
  return new;
end $$;
create trigger protect_plan_document before insert or update on public.daily_plans for each row execute function public.guard_tre_document_write_v1();
create trigger protect_draft_document before insert or update on public.planner_drafts for each row execute function public.guard_tre_document_write_v1();
create trigger protect_actual_document before insert or update on public.daily_checkins for each row execute function public.guard_tre_document_write_v1();
create trigger protect_workout_document before insert or update on public.workout_sessions for each row execute function public.guard_tre_document_write_v1();

revoke all on function public.valid_tre_totals_v1(jsonb),public.valid_tre_clock_v1(jsonb),public.validate_actual_v3(jsonb,date),public.guard_tre_document_write_v1() from public,anon;
grant execute on function public.valid_tre_totals_v1(jsonb),public.valid_tre_clock_v1(jsonb),public.validate_actual_v3(jsonb,date) to authenticated;
revoke all on function public.save_daily_actual_v3(date,jsonb,jsonb,boolean,bigint),public.complete_daily_record_v3(date,jsonb,jsonb,jsonb,smallint,text,text[],jsonb,jsonb,boolean,bigint),public.save_workout_schedules_v1(jsonb,text),public.save_workout_session_v2(jsonb,bigint) from public,anon;
grant execute on function public.save_daily_actual_v3(date,jsonb,jsonb,boolean,bigint),public.complete_daily_record_v3(date,jsonb,jsonb,jsonb,smallint,text,text[],jsonb,jsonb,boolean,bigint),public.save_workout_schedules_v1(jsonb,text),public.save_workout_session_v2(jsonb,bigint) to authenticated;
