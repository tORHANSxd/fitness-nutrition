-- Per-day targets reuse existing date documents, ownership checks and revision RPCs.
create function public.nutrition_adjust_daily_target_v1(t jsonb, a jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare energy numeric; carbs numeric;
begin
  if a is null then return t; end if;
  if jsonb_typeof(a) is distinct from 'object'
    or jsonb_typeof(a->'tdeeKcal') is distinct from 'number'
    or jsonb_typeof(a->'deficitKcal') is distinct from 'number'
    or (a->>'tdeeKcal')::numeric<=0 or (a->>'tdeeKcal')::numeric>10000
    or (a->>'deficitKcal')::numeric<0 or (a->>'deficitKcal')::numeric>=(a->>'tdeeKcal')::numeric
    or not public.valid_tre_totals_v1(t) then raise exception 'invalid_daily_energy_adjustment' using errcode='22023'; end if;
  energy:=(a->>'tdeeKcal')::numeric-(a->>'deficitKcal')::numeric;
  carbs:=(energy-(t->>'protein')::numeric*4-(t->>'fat')::numeric*9)/4;
  if carbs<0 then raise exception 'daily_macros_exceed_energy' using errcode='22023'; end if;
  return jsonb_build_object('kcal',energy,'protein',t->'protein','fat',t->'fat','carbs',carbs);
end $$;
revoke all on function public.nutrition_adjust_daily_target_v1(jsonb,jsonb) from public,anon;
grant execute on function public.nutrition_adjust_daily_target_v1(jsonb,jsonb) to authenticated;

create function public.nutrition_targets_equal_v1(a jsonb,b jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare k text;
begin
  if not public.valid_tre_totals_v1(a) or not public.valid_tre_totals_v1(b) then return false; end if;
  foreach k in array array['kcal','protein','fat','carbs'] loop
    if abs((a->>k)::numeric-(b->>k)::numeric)>0.000001 then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.nutrition_targets_equal_v1(jsonb,jsonb) from public,anon;
grant execute on function public.nutrition_targets_equal_v1(jsonb,jsonb) to authenticated;

create or replace function public.guard_nutrition_snapshots_v1() returns trigger language plpgsql security invoker set search_path='' as $$
declare snapshot jsonb; protocol jsonb; reference_id uuid; expected jsonb; adjustment jsonb;
begin
  if tg_table_name='daily_plans' then
    protocol:=new.profile->'protocolSnapshot'; adjustment:=new.profile->'dailyEnergyAdjustment';
    if protocol->>'schemaVersion' in ('2','3') then
      snapshot:=protocol->'nutrition';
      expected:=public.nutrition_adjust_daily_target_v1(public.nutrition_target_on_date_v1(protocol,new.plan_date),adjustment);
      if new.result->'targetResolution' is distinct from snapshot->'result'
        or not public.nutrition_targets_equal_v1(new.result->'dailyTarget',expected)
        or new.result->'cycleAverageTarget' is distinct from protocol->'dailyTarget' then raise exception 'nutrition_result_mismatch' using errcode='22023'; end if;
    elsif adjustment is not null then
      expected:=public.nutrition_adjust_daily_target_v1(coalesce(protocol->'dailyTarget',new.result->'dailyTarget'),adjustment);
      if not public.nutrition_targets_equal_v1(new.result->'dailyTarget',expected) then raise exception 'nutrition_result_mismatch' using errcode='22023'; end if;
    end if;
    if adjustment is not null and (new.result->'tdee' is distinct from adjustment->'tdeeKcal'
      or abs((new.result->>'plannedCalorieDelta')::numeric+(adjustment->>'deficitKcal')::numeric)>0.000001) then raise exception 'nutrition_expenditure_mismatch' using errcode='22023'; end if;
  else
    adjustment:=new.actual->'targetEnergyAdjustment';
    if new.actual ? 'targetProtocolSnapshot' then
      protocol:=new.actual->'targetProtocolSnapshot'; reference_id:=(protocol->>'id')::uuid;
      expected:=public.nutrition_adjust_daily_target_v1(public.nutrition_target_on_date_v1(protocol,new.plan_date),adjustment);
      if not public.validate_tre_protocol_v2(protocol) or (protocol->>'effectiveFrom')::date>new.plan_date
        or not exists(select 1 from public.user_plan_protocols where user_id=new.user_id and id=reference_id and config=protocol)
        or not public.nutrition_targets_equal_v1(new.target,expected) then raise exception 'invalid_actual_target_protocol' using errcode='42501'; end if;
      if tg_op='UPDATE' and old.actual ? 'targetProtocolSnapshot' and old.actual->'targetProtocolSnapshot' is distinct from protocol then raise exception 'frozen_actual_target_protocol' using errcode='40001'; end if;
    elsif tg_op='UPDATE' and old.actual ? 'targetProtocolSnapshot' then raise exception 'frozen_actual_target_protocol' using errcode='40001';
    elsif adjustment is not null then
      expected:=public.nutrition_adjust_daily_target_v1(new.target,adjustment);
      if not public.nutrition_targets_equal_v1(new.target,expected) then raise exception 'invalid_actual_target' using errcode='22023'; end if;
    end if;
  end if;
  return new;
end $$;

-- Extend the shared draft validator; retain protocol ownership and meal checks.
do $$ declare definition text; marker text:='  if p_profile->>''targetMode'' = ''calibrated'' then'; begin
  definition:=pg_get_functiondef('public.validate_plan_document_v3(date,jsonb,jsonb,uuid)'::regprocedure);
  if position(marker in definition)=0 then raise exception 'unexpected_plan_validator'; end if;
  definition:=replace(definition,marker,'  if p_profile ? ''dailyEnergyAdjustment'' then
    perform public.nutrition_adjust_daily_target_v1(coalesce(public.nutrition_target_on_date_v1(p_profile->''protocolSnapshot'',p_date),''{"kcal":0,"protein":0,"fat":0,"carbs":0}''::jsonb),p_profile->''dailyEnergyAdjustment'');
  end if;
'||marker);
  execute definition;
end $$;
