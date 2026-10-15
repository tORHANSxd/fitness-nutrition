-- Additive standard: preserve legacy food, plan, actual and target snapshots.
do $$ declare table_name text; begin
  foreach table_name in array array['foods','food_overrides'] loop
    execute format('alter table public.%I
      add column source_kcal_per_100g numeric check(source_kcal_per_100g >= 0),
      add column source_energy_method text not null default ''legacy_unknown'' check(source_energy_method in (''product_label'',''food_composition'',''recipe'',''macro_estimate'',''legacy_unknown'')),
      add column effective_energy_basis text not null default ''macros'' check(effective_energy_basis in (''label'',''macros'')),
      add column source_quality text not null default ''unverified'' check(source_quality in (''verified_label'',''matched_reference'',''recipe_estimate'',''unverified'')),
      add column carbohydrate_basis text not null default ''unknown'' check(carbohydrate_basis in (''available_excluding_fiber'',''total_including_fiber'',''net_declared'',''unknown'')),
      add column source_carbs_per_100g numeric check(source_carbs_per_100g >= 0),
      add column fiber_per_100g numeric check(fiber_per_100g >= 0),
      add column portion_policy text not null default ''food'' check(portion_policy in (''food'',''fixed_dose'')),
      add constraint %I check(effective_energy_basis <> ''label'' or (source_kcal_per_100g is not null and source_kcal_per_100g=kcal_per_100g)),
      add constraint %I check(carbohydrate_basis <> ''total_including_fiber'' or fiber_per_100g is null or source_carbs_per_100g is null or fiber_per_100g <= source_carbs_per_100g)', table_name, table_name||'_source_energy_check', table_name||'_source_fiber_check');
  end loop;
end $$;
alter table public.body_logs add column morning_weight_confirmed boolean,
  add constraint confirmed_morning_weight_present check(morning_weight_confirmed is distinct from true or (weight_kg is not null and weight_kg > 0));

create table public.nutrition_standard_proposals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=65536
    and payload->>'documentType'='personal_nutrition_standard' and payload->>'documentVersion'='1.0.0'
    and payload->>'status'='proposal_not_activated' and payload->>'defaultMode'='fixed_daily'
    and payload->'optionalCarbCycle'->'enabled'='false'::jsonb),
  updated_at timestamptz not null default now()
);
alter table public.nutrition_standard_proposals enable row level security;
revoke all on public.nutrition_standard_proposals from public,anon;
grant select,insert,update,delete on public.nutrition_standard_proposals to authenticated;
create policy own_standard_proposal on public.nutrition_standard_proposals for all to authenticated
  using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create trigger set_standard_proposal_updated_at before update on public.nutrition_standard_proposals for each row execute function public.set_updated_at();

create function public.valid_food_snapshot_v2(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; n numeric;
begin
  if jsonb_typeof(s) is distinct from 'object' or coalesce(s->'version','null'::jsonb) not in ('1'::jsonb,'2'::jsonb) then return false; end if;
  foreach k in array array['kcalPer100g','proteinPer100g','carbsPer100g','fatPer100g'] loop
    if jsonb_typeof(s->k) is distinct from 'number' or (s->>k)::numeric<0 then return false; end if;
  end loop;
  if s->'version'='1'::jsonb then return true; end if;
  if not (s ?& array['sourceKcalPer100g','sourceEnergyMethod','macroKcalPer100g','effectiveEnergyBasis','sourceQuality','carbohydrateBasis','sourceCarbsPer100g','fiberPer100g','portionPolicy','energyPolicyVersion'])
    or s->>'energyPolicyVersion' is distinct from 'food-energy-v2'
    or coalesce(s->>'effectiveEnergyBasis','') not in ('label','macros')
    or coalesce(s->>'sourceEnergyMethod','') not in ('product_label','food_composition','recipe','macro_estimate','legacy_unknown')
    or coalesce(s->>'sourceQuality','') not in ('verified_label','matched_reference','recipe_estimate','unverified')
    or coalesce(s->>'carbohydrateBasis','') not in ('available_excluding_fiber','total_including_fiber','net_declared','unknown')
    or coalesce(s->>'portionPolicy','') not in ('food','fixed_dose')
    or coalesce(s->>'weightBasis','') not in ('raw','cooked','none')
    or jsonb_typeof(s->'name') is distinct from 'string' or coalesce(length(s->>'name'),0)=0
    or jsonb_typeof(s->'category') is distinct from 'string' then return false; end if;
  foreach k in array array['sourceKcalPer100g','sourceCarbsPer100g','fiberPer100g','cookedRawRatio','ediblePercent'] loop
    if s->>k is not null and (jsonb_typeof(s->k) is distinct from 'number' or (s->>k)::numeric<0) then return false; end if;
  end loop;
  if s->>'cookedRawRatio' is not null and (s->>'cookedRawRatio')::numeric<=0
    or s->>'ediblePercent' is not null and (s->>'ediblePercent')::numeric not between 0.000000001 and 100 then return false; end if;
  n:=(s->>'proteinPer100g')::numeric*4+(s->>'carbsPer100g')::numeric*4+(s->>'fatPer100g')::numeric*9;
  if jsonb_typeof(s->'macroKcalPer100g') is distinct from 'number' or abs((s->>'macroKcalPer100g')::numeric-n)>0.000001 then return false; end if;
  if s->>'effectiveEnergyBasis'='label' and (s->>'sourceKcalPer100g' is null or s->'sourceKcalPer100g' is distinct from s->'kcalPer100g') then return false; end if;
  if s->>'carbohydrateBasis'='total_including_fiber' and (s->>'fiberPer100g')::numeric>(s->>'sourceCarbsPer100g')::numeric then return false; end if;
  return true;
exception when others then return false;
end $$;
revoke all on function public.valid_food_snapshot_v2(jsonb) from public,anon;
grant execute on function public.valid_food_snapshot_v2(jsonb) to authenticated;

create function public.validate_tre_protocol_v3(p jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare base jsonb; s jsonb:=p->'nutritionStrategy'; c jsonb:=p->'trainingCycle'; t jsonb; k text; n integer; d jsonb;
begin
  if p->'schemaVersion' is distinct from '3'::jsonb or s->'version' is distinct from '1'::jsonb
    or coalesce(s->>'mode','') not in ('fixed_daily','weekly_cycle') or (p ? 'reviewMode' and p->>'reviewMode' is distinct from 'personal_standard_v1') then return false; end if;
  base:=jsonb_set(p-'nutritionStrategy','{schemaVersion}','2');
  if c->>'id'='weeklyStrengthV1' then
    if c->'lengthDays' is distinct from '7'::jsonb or c->>'phase' is distinct from 'recovery'
      or jsonb_typeof(c->'isoWeekdaysTraining') is distinct from 'array' or jsonb_array_length(c->'isoWeekdaysTraining')<>4
      or (select count(distinct value) from jsonb_array_elements(c->'isoWeekdaysTraining'))<>4 then return false; end if;
    for d in select value from jsonb_array_elements(c->'isoWeekdaysTraining') loop
      if jsonb_typeof(d) is distinct from 'number' or (d#>>'{}')::numeric not between 1 and 7 or (d#>>'{}')::numeric<>trunc((d#>>'{}')::numeric) then return false; end if;
    end loop;
    base:=jsonb_set(base,'{trainingCycle}',jsonb_build_object('id','rptAlternate8DayV4','lengthDays',8,'phase','recovery','anchorDate',c->>'anchorDate'));
  end if;
  if not public.validate_tre_protocol_v2(base) then return false; end if;
  if (p->'reviewRules'->>'minWeightsPerWeek')::integer<4 or (p->'reviewRules'->>'minIntakeDaysPerWeek')::integer<6 then return false; end if;
  if s->>'mode'='fixed_daily' then return true; end if;
  if c->>'id' is distinct from 'weeklyStrengthV1' or s->'isoWeekdaysTraining' is distinct from c->'isoWeekdaysTraining'
    or jsonb_typeof(s->'startAfterStableLoggingDays') is distinct from 'number'
    or (s->>'startAfterStableLoggingDays')::numeric not between 14 and 90
    or (s->>'startAfterStableLoggingDays')::numeric<>trunc((s->>'startAfterStableLoggingDays')::numeric)
    or jsonb_typeof(s->'weeklyTargetKcal') is distinct from 'number' then return false; end if;
  n:=jsonb_array_length(s->'isoWeekdaysTraining');
  for t in select s->'trainingTarget' union all select s->'restTarget' loop
    if not public.valid_tre_totals_v1(t) or (t->>'kcal')::numeric<=0
      or abs((t->>'kcal')::numeric-(t->>'protein')::numeric*4-(t->>'carbs')::numeric*4-(t->>'fat')::numeric*9)>0.000001 then return false; end if;
  end loop;
  foreach k in array array['kcal','protein','carbs','fat'] loop
    if abs((s->'trainingTarget'->>k)::numeric*n+(s->'restTarget'->>k)::numeric*(7-n)-(p->'dailyTarget'->>k)::numeric*7)>0.000001 then return false; end if;
  end loop;
  return abs((s->>'weeklyTargetKcal')::numeric-(p->'dailyTarget'->>'kcal')::numeric*7)<=0.000001;
exception when others then return false;
end $$;
revoke all on function public.validate_tre_protocol_v3(jsonb) from public,anon;
grant execute on function public.validate_tre_protocol_v3(jsonb) to authenticated;

-- Extend the existing validator without duplicating or loosening its v1/v2 calculation checks.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.validate_tre_protocol_v2(jsonb)'::regprocedure);
  if position('if p->''schemaVersion''=''1''::jsonb' in definition)=0 then raise exception 'unexpected_protocol_validator'; end if;
  definition:=replace(definition,'if p->''schemaVersion''=''1''::jsonb','if p->''schemaVersion''=''3''::jsonb then return public.validate_tre_protocol_v3(p); end if;
  if p ? ''nutritionStrategy'' or p ? ''optionalCarbCycle'' then return false; end if;
  if p->''schemaVersion''=''1''::jsonb');
  execute definition;
end $$;
alter table public.user_plan_protocols drop constraint user_plan_protocols_schema_version_check;
alter table public.user_plan_protocols add constraint user_plan_protocols_schema_version_check check(schema_version in (1,2,3));

create function public.nutrition_target_on_date_v1(p jsonb,d date) returns jsonb language sql immutable set search_path='' as $$
  select case when p->'schemaVersion'='3'::jsonb and p->'nutritionStrategy'->>'mode'='weekly_cycle'
    then case when p->'nutritionStrategy'->'isoWeekdaysTraining' @> jsonb_build_array(extract(isodow from d)::integer)
      then p->'nutritionStrategy'->'trainingTarget' else p->'nutritionStrategy'->'restTarget' end else p->'dailyTarget' end
$$;
revoke all on function public.nutrition_target_on_date_v1(jsonb,date) from public,anon;
grant execute on function public.nutrition_target_on_date_v1(jsonb,date) to authenticated;

create or replace function public.guard_nutrition_snapshots_v1() returns trigger language plpgsql security invoker set search_path='' as $$
declare snapshot jsonb; protocol jsonb; reference_id uuid;
begin
  if tg_table_name='daily_plans' then
    protocol:=new.profile->'protocolSnapshot';
    if protocol->>'schemaVersion' in ('2','3') then
      snapshot:=protocol->'nutrition';
      if new.result->'targetResolution' is distinct from snapshot->'result'
        or new.result->'dailyTarget' is distinct from public.nutrition_target_on_date_v1(protocol,new.plan_date)
        or new.result->'cycleAverageTarget' is distinct from protocol->'dailyTarget' then raise exception 'nutrition_result_mismatch' using errcode='22023'; end if;
    end if;
  elsif new.actual ? 'targetProtocolSnapshot' then
    protocol:=new.actual->'targetProtocolSnapshot'; reference_id:=(protocol->>'id')::uuid;
    if not public.validate_tre_protocol_v2(protocol) or (protocol->>'effectiveFrom')::date>new.plan_date
      or not exists(select 1 from public.user_plan_protocols where user_id=new.user_id and id=reference_id and config=protocol)
      or new.target is distinct from public.nutrition_target_on_date_v1(protocol,new.plan_date) then raise exception 'invalid_actual_target_protocol' using errcode='42501'; end if;
    if tg_op='UPDATE' and old.actual ? 'targetProtocolSnapshot' and old.actual->'targetProtocolSnapshot' is distinct from protocol then raise exception 'frozen_actual_target_protocol' using errcode='40001'; end if;
  elsif tg_op='UPDATE' and old.actual ? 'targetProtocolSnapshot' then raise exception 'frozen_actual_target_protocol' using errcode='40001';
  end if;
  return new;
end $$;

do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.validate_plan_document_v3(date,jsonb,jsonb,uuid)'::regprocedure);
  if position('if e->''foodSnapshot''->>''version'' is distinct from ''1''' in definition)=0 then raise exception 'unexpected_plan_validator'; end if;
  definition:=replace(definition,'if e->''foodSnapshot''->>''version'' is distinct from ''1''','if not public.valid_food_snapshot_v2(e->''foodSnapshot'')');
  definition:=replace(definition,'if e ? ''foodSnapshot'' then','if e ? ''foodSnapshot'' then
        if e->>''inputWeightBasis'' is not null and e->''foodSnapshot''->>''weightBasis'' in (''raw'',''cooked'')
          and e->>''inputWeightBasis'' <> e->''foodSnapshot''->>''weightBasis'' and coalesce((e->>''inputCookedRawRatio'')::numeric,(e->''foodSnapshot''->>''cookedRawRatio'')::numeric,0)<=0 then raise exception ''WEIGHT_BASIS_MISMATCH'' using errcode=''22023''; end if;');
  execute definition;
  definition:=pg_get_functiondef('public.validate_actual_v3(jsonb,date)'::regprocedure);
  if position('f->''foodSnapshot''->>''version'' is distinct from ''1''' in definition)=0 then raise exception 'unexpected_actual_validator'; end if;
  definition:=replace(definition,'f->''foodSnapshot''->>''version'' is distinct from ''1''','not public.valid_food_snapshot_v2(f->''foodSnapshot'') or (f->''foodSnapshot''->>''version''=''2'' and f->>''energyBasis'' is distinct from f->''foodSnapshot''->>''effectiveEnergyBasis'')');
  definition:=replace(definition,'(k<>''kcalPer100g'' or f->>''energyBasis''=''label'')','((k=''kcalPer100g'' and f->>''energyBasis''=''label'') or (k<>''kcalPer100g'' and f->>''energyBasis''=''macros''))');
  execute definition;
end $$;

create function public.nutrition_stable_logging_days_v1() returns integer language plpgsql stable security invoker set search_path='' as $$
declare u uuid:=auth.uid(); p jsonb; d date; today_date date; n integer:=0; c public.daily_checkins%rowtype;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select config into p from public.user_plan_protocols where user_id=u and effective_from <= (now() at time zone (config->>'timeZone'))::date order by effective_from desc limit 1;
  if p is null then return 0; end if;
  today_date:=(now() at time zone (p->>'timeZone'))::date;
  select max(plan_date) into d from public.daily_checkins where user_id=u and completed and plan_date<=today_date;
  if d is null or d<today_date-1 then return 0; end if;
  while n<90 loop
    select * into c from public.daily_checkins where user_id=u and plan_date=d-n and completed;
    exit when not found or c.actual->'version' is distinct from '3'::jsonb or c.actual ? 'legacyActual'
      or c.actual->'intakeComplete' is distinct from 'true'::jsonb or c.actual->'targetProtocolSnapshot' is distinct from p
      or c.target is distinct from public.nutrition_target_on_date_v1(p,c.plan_date)
      or jsonb_typeof(c.actual->'mealEvents') is distinct from 'array' or jsonb_array_length(c.actual->'mealEvents')=0
      or exists(select 1 from jsonb_array_elements(c.actual->'mealEvents') e where e->'containsCalories'='true'::jsonb and jsonb_array_length(e->'actualFoodEntries')=0)
      or exists(select 1 from public.daily_plans where user_id=u and plan_date=c.plan_date and cardinality(integrity_flags)>0);
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.nutrition_stable_logging_days_v1() from public,anon;
grant execute on function public.nutrition_stable_logging_days_v1() to authenticated;

create function public.guard_standard_protocol_v1() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.schema_version=3 then
    if new.effective_from<(now() at time zone (new.config->>'timeZone'))::date then raise exception 'new_target_cannot_rewrite_past' using errcode='22023'; end if;
    if new.config->'nutritionStrategy'->>'mode'='weekly_cycle' and (public.nutrition_stable_logging_days_v1()<(new.config->'nutritionStrategy'->>'startAfterStableLoggingDays')::integer
      or new.config->'nutrition'->'body'->>'recovery' is distinct from 'stable') then raise exception 'cycle_requires_14_stable_actual_days_and_recovery_confirmation' using errcode='22023'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_standard_protocol_v1() from public,anon;
grant execute on function public.guard_standard_protocol_v1() to authenticated;
create trigger validate_standard_activation before insert on public.user_plan_protocols for each row execute function public.guard_standard_protocol_v1();

create function public.nutrition_standard_capabilities_v1() returns integer language sql immutable set search_path='' as $$ select 3 $$;
revoke all on function public.nutrition_standard_capabilities_v1() from public,anon;
grant execute on function public.nutrition_standard_capabilities_v1() to authenticated;

-- Keep atomic/partial imports and bind every inserted row to the authenticated owner.
create or replace function public.import_user_foods_v1(p_rows jsonb,p_atomic boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); item jsonb; k text; row_index integer:=0; inserted integer:=0; errors jsonb:='[]'::jsonb;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>10000 then raise exception 'rows_must_be_an_array' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    begin
      if jsonb_typeof(item) is distinct from 'object' or coalesce(length(trim(item->>'name')),0)=0
        or coalesce(item->>'weight_basis','') not in ('raw','cooked','none') then raise exception 'invalid_food_row_%',row_index using errcode='22023'; end if;
      foreach k in array array['kcal_per_100g','fat_per_100g','carbs_per_100g','protein_per_100g'] loop
        if jsonb_typeof(item->k) is distinct from 'number' or (item->>k)::numeric<0 then raise exception 'MISSING_OR_INVALID_NUTRIENT_DATA_%',row_index using errcode='22023'; end if;
      end loop;
      foreach k in array array['source_kcal_per_100g','source_carbs_per_100g','fiber_per_100g','cooked_raw_ratio'] loop
        if item->>k is not null and (jsonb_typeof(item->k) is distinct from 'number' or (item->>k)::numeric<0) then raise exception 'invalid_food_metadata_%',row_index using errcode='22023'; end if;
      end loop;
      if item->>'cooked_raw_ratio' is not null and (item->>'cooked_raw_ratio')::numeric<=0 then raise exception 'invalid_food_yield' using errcode='22023'; end if;
      insert into public.foods(user_id,name,category,kcal_per_100g,fat_per_100g,carbs_per_100g,protein_per_100g,weight_basis,cooked_raw_ratio,source,serving_description,
        source_kcal_per_100g,source_energy_method,effective_energy_basis,source_quality,carbohydrate_basis,source_carbs_per_100g,fiber_per_100g,portion_policy)
      values(u,trim(item->>'name'),item->>'category',(item->>'kcal_per_100g')::numeric,(item->>'fat_per_100g')::numeric,(item->>'carbs_per_100g')::numeric,(item->>'protein_per_100g')::numeric,item->>'weight_basis',(item->>'cooked_raw_ratio')::numeric,'user',item->>'serving_description',
        (item->>'source_kcal_per_100g')::numeric,coalesce(item->>'source_energy_method','legacy_unknown'),coalesce(item->>'effective_energy_basis','macros'),coalesce(item->>'source_quality','unverified'),coalesce(item->>'carbohydrate_basis','unknown'),(item->>'source_carbs_per_100g')::numeric,(item->>'fiber_per_100g')::numeric,coalesce(item->>'portion_policy','food'));
      inserted:=inserted+1;
    exception when others then
      if p_atomic then raise; end if;
      errors:=errors||jsonb_build_array(jsonb_build_object('index',row_index,'message',sqlerrm));
    end;
    row_index:=row_index+1;
  end loop;
  return jsonb_build_object('inserted',inserted,'errors',errors);
end $$;
