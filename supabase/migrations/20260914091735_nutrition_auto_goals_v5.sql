-- Additive v5 extension. No data rewrite, no new source-of-truth table.
create function public.nutrition_goals_capabilities_v1() returns integer language sql immutable set search_path='' as $$ select 2 $$;
revoke all on function public.nutrition_goals_capabilities_v1() from public,anon;
grant execute on function public.nutrition_goals_capabilities_v1() to authenticated;

create function public.nutrition_number_v1(v jsonb, minimum numeric default 0, exclusive boolean default false)
returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
  if jsonb_typeof(v) is distinct from 'number' then raise exception 'invalid_nutrition_number' using errcode='22023'; end if;
  n:=(v#>>'{}')::numeric;
  if n < minimum or (exclusive and n=minimum) or n > 1000000000 then raise exception 'invalid_nutrition_number' using errcode='22023'; end if;
  return n;
end $$;

create function public.validate_nutrition_snapshot_v1(s jsonb)
returns boolean language plpgsql stable set search_path='' as $$
declare p jsonb:=s->'policy'; b jsonb:=s->'body'; r jsonb:=s->'result'; target jsonb:=r->'resolvedTarget';
  scope jsonb:=b->'scope'; e jsonb:=p->'energy'; pr jsonb:=p->'protein'; f jsonb:=p->'fat'; c jsonb:=p->'carbs'; tm jsonb:=p->'tdee'; rm jsonb:=p->'rmr';
  dt date; age_years numeric; w numeric; h numeric; ffm numeric; paired numeric; measured date; label text;
  preset_delta numeric; preset_p numeric; preset_f numeric; step text; expected_raw numeric; expected_resolved numeric; expected_unit text;
  rmr numeric; tdee numeric; raw_e numeric; energy numeric; raw_p numeric; protein numeric; raw_f numeric; selected_f numeric; fat numeric; carbs numeric;
  exercise numeric:=0; cycle numeric; multiplier numeric; delta numeric; ratio numeric; k text; v jsonb; manual_e boolean; uses_ffm boolean;
begin
  if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text)>65536 or s->'schemaVersion' is distinct from '1'::jsonb or s->>'source' is distinct from 'user_confirmed'
    or p->'schemaVersion' is distinct from '1'::jsonb or p->>'policyVersion' is distinct from 'nutrition-goals-v5.0' or p->'presetVersion' is distinct from '1'::jsonb
    or r->>'algorithmVersion' is distinct from 'nutrition-v5.0' or r->>'policyVersion' is distinct from p->>'policyVersion' or r->'presetVersion' is distinct from p->'presetVersion'
    or p->>'refreshMode' is distinct from 'preview_then_confirm' or r->>'status' is distinct from 'valid'
    or coalesce(p->>'presetId','') not in ('cut_recomp','cut_lean','recomp','lean_gain','maintain','custom') then return false; end if;
  if scope->'adultAttested' is distinct from 'true'::jsonb then return false; end if;
  foreach k in array array['excluded','pregnantOrLactating','specialNutritionTherapy','eatingDisorder','unexplainedWeightLoss','enduranceOrCompetitive'] loop
    if scope ? k and scope->k is distinct from 'false'::jsonb then return false; end if;
  end loop;
  if b->>'recovery'='concern' or coalesce(b->>'recovery','unknown') not in ('unknown','stable') then return false; end if;
  if b->>'weightSource' is not null and b->>'weightSource' not in ('manual','confirmed','seven_day_mean')
    or b->>'ageSource' is not null and b->>'ageSource' not in ('confirmed_years','birth_date')
    or b->>'calculationSex' is not null and b->>'calculationSex' not in ('male','female')
    or b->>'ffmInput' is not null and b->>'ffmInput' not in ('body_fat','direct') then return false; end if;
  if coalesce(b->>'calculationDate','') !~ '^\d{4}-\d{2}-\d{2}$' or not exists(select 1 from pg_timezone_names where name=b->>'timeZone') then return false; end if;
  dt:=(b->>'calculationDate')::date;
  if b->>'weightKg' is not null then w:=public.nutrition_number_v1(b->'weightKg',0,true); end if;
  if b->>'heightCm' is not null then h:=public.nutrition_number_v1(b->'heightCm',0,true); end if;
  if b->>'ageYears' is not null then age_years:=public.nutrition_number_v1(b->'ageYears'); if age_years<18 or age_years<>trunc(age_years) then return false; end if; end if;
  if b->>'birthDate' is not null then
    if b->>'birthDate' !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    if age_years is not null and age_years<>extract(year from age(dt,(b->>'birthDate')::date)) then return false; end if;
    age_years:=extract(year from age(dt,(b->>'birthDate')::date)); if age_years<18 then return false; end if;
  end if;
  foreach k in array array['bodyFatPct','bodyFatWeightKg','ffmKg'] loop
    if b->>k is not null then perform public.nutrition_number_v1(b->k,0,k<>'bodyFatPct'); end if;
  end loop;
  if (b->>'bodyFatPct')::numeric>=100 or (b->>'ffmKg')::numeric>w then return false; end if;
  foreach k in array array['bodyFatMeasuredOn','ffmMeasuredOn'] loop
    if b ? k and (coalesce(b->>k,'') !~ '^\d{4}-\d{2}-\d{2}$' or (b->>k)::date>dt) then return false; end if;
  end loop;
  if b ? 'weightDates' then
    if jsonb_typeof(b->'weightDates') is distinct from 'array' or jsonb_array_length(b->'weightDates')>366 then return false; end if;
    for v in select value from jsonb_array_elements(b->'weightDates') loop
      if coalesce(v#>>'{}','') !~ '^\d{4}-\d{2}-\d{2}$' or (v#>>'{}')::date>dt then return false; end if;
    end loop;
  end if;
  if b->>'weightSource'='seven_day_mean' then
    if jsonb_typeof(b->'weightDates') is distinct from 'array' or jsonb_array_length(b->'weightDates') not between 4 and 7
      or (select count(distinct value) from jsonb_array_elements(b->'weightDates'))<>jsonb_array_length(b->'weightDates')
      or exists(select 1 from jsonb_array_elements_text(b->'weightDates') where value::date<dt-6) then return false; end if;
  end if;
  if coalesce(rm->>'kind','') not in ('mifflin_st_jeor','cunningham_1980','measured','not_used')
    or coalesce(tm->>'kind','') not in ('pal_total','non_exercise_plus_planned','manual','not_used')
    or coalesce(e->>'kind','') not in ('preset_percent','percent','delta_kcal','fixed_kcal','from_macros')
    or coalesce(pr->>'kind','') not in ('body_weight','ffm','reference_weight','fixed_grams')
    or coalesce(f->>'kind','') not in ('body_weight','energy_share','fixed_grams')
    or coalesce(c->>'kind','') not in ('residual','fixed_grams') then return false; end if;
  perform public.nutrition_number_v1(p->'presetDeltaRatio',-1000000);
  -- Type-check explicitly supplied numeric options, including inactive methods. Null can remain unused.
  for v in select value from jsonb_each(p) where key in ('rmr','tdee','energy','protein','fat','carbs') loop
    for k in select key from jsonb_each(v) where key in ('kcal','grams','coefficient','weightKg','multiplier','cycleDays','share','minimumEnergyShare','deltaRatio','deltaKcal') loop
      if v->>k is not null then perform public.nutrition_number_v1(v->k,case when k in ('deltaRatio','deltaKcal') then -1000000 else 0 end); end if;
    end loop;
  end loop;
  if p->>'originPreset' is not null and (p->>'presetId'<>'custom' or p->>'originPreset' not in ('cut_recomp','cut_lean','recomp','lean_gain','maintain')) then return false; end if;
  if p->>'presetId'='custom' then
    if e->>'kind'='preset_percent' then return false; end if;
  else
    -- These are frozen presetVersion 1 product defaults, not a mutable live lookup.
    case p->>'presetId'
      when 'cut_recomp' then preset_delta:=-0.15; preset_p:=1.9; preset_f:=0.7;
      when 'cut_lean' then preset_delta:=-0.10; preset_p:=2.2; preset_f:=0.8;
      when 'recomp' then preset_delta:=0; preset_p:=2; preset_f:=0.8;
      when 'lean_gain' then preset_delta:=0.05; preset_p:=1.8; preset_f:=0.8;
      when 'maintain' then preset_delta:=0; preset_p:=1.6; preset_f:=0.8;
    end case;
    if p->'presetDeltaRatio' is distinct from to_jsonb(preset_delta) or pr->>'kind'<>'body_weight' or pr->'coefficient' is distinct from to_jsonb(preset_p)
      or f->>'kind'<>'body_weight' or f->'coefficient' is distinct from to_jsonb(preset_f)
      or not (e->>'kind'='preset_percent' or (e->>'kind'='percent' and e->'deltaRatio'=to_jsonb(preset_delta))) then return false; end if;
  end if;
  if p->'rounding'->'autoEnergyStepKcal' is distinct from '25'::jsonb or p->'rounding'->'autoProteinStepG' is distinct from '5'::jsonb or p->'rounding'->'autoFatStepG' is distinct from '5'::jsonb then return false; end if;
  manual_e:=e->>'kind' in ('fixed_kcal','from_macros');
  if e->>'kind'='from_macros' then
    if pr->>'kind'<>'fixed_grams' or f->>'kind'<>'fixed_grams' or c->>'kind'<>'fixed_grams' then return false; end if;
  elsif c->>'kind'<>'residual' then return false; end if;
  if tm->>'kind'='pal_total' and (tm->'includesExercise' is distinct from 'true'::jsonb or tm ? 'exerciseKcal' or tm ? 'netExercise' or p ? 'exerciseKcal') then return false; end if;
  uses_ffm:=pr->>'kind'='ffm' or (not manual_e and tm->>'kind'<>'manual' and rm->>'kind'='cunningham_1980');
  if uses_ffm then
    if b->>'ffmInput'='direct' or (b->>'ffmInput' is null and b->>'ffmKg' is not null and b->>'bodyFatPct' is null) then
      ffm:=public.nutrition_number_v1(b->'ffmKg',0,true); paired:=public.nutrition_number_v1(b->'weightKg',0,true); measured:=(b->>'ffmMeasuredOn')::date; label:=b->>'ffmSourceLabel';
    else
      if b->>'ffmInput' is null and b->>'ffmKg' is not null and b->>'bodyFatPct' is not null then return false; end if;
      paired:=public.nutrition_number_v1(b->'bodyFatWeightKg',0,true); ffm:=paired*(1-public.nutrition_number_v1(b->'bodyFatPct')/100); measured:=(b->>'bodyFatMeasuredOn')::date; label:=b->>'bodyFatSource';
      if w is not null and abs(paired-w)/w>0.05 then return false; end if;
    end if;
    if ffm<=0 or ffm>paired or measured is null or measured>dt or dt-measured>30 or coalesce(length(trim(label)),0) not between 1 and 200 then return false; end if;
    if b->>'ffmKg' is not null and b->>'bodyFatPct' is not null and b->>'bodyFatWeightKg' is not null
      and abs((b->>'ffmKg')::numeric-(b->>'bodyFatWeightKg')::numeric*(1-(b->>'bodyFatPct')::numeric/100))>paired*0.05 then return false; end if;
  end if;
  if not manual_e then
    if tm->>'kind'='manual' then
      tdee:=public.nutrition_number_v1(tm->'kcal',0,true);
      if coalesce(tm->>'source','') not in ('user_estimate','observational','measured_total') then return false; end if;
      if tm ? 'assessedOn' and (coalesce(tm->>'assessedOn','') !~ '^\d{4}-\d{2}-\d{2}$' or (tm->>'assessedOn')::date>dt) then return false; end if;
    else
      if rm->>'kind'='mifflin_st_jeor' then
        if w is null or h is null or age_years is null or coalesce(b->>'calculationSex','') not in ('male','female') then return false; end if;
        rmr:=10*w+6.25*h-5*age_years+case when b->>'calculationSex'='male' then 5 else -161 end;
      elsif rm->>'kind'='cunningham_1980' then rmr:=500+22*ffm;
      elsif rm->>'kind'='measured' then
        rmr:=public.nutrition_number_v1(rm->'kcal',0,true);
        if coalesce(rm->>'measuredOn','') !~ '^\d{4}-\d{2}-\d{2}$' or (rm->>'measuredOn')::date>dt or coalesce(length(trim(rm->>'sourceLabel')),0) not between 1 and 200 then return false; end if;
      else return false; end if;
      if rmr<=0 then return false; end if;
      multiplier:=public.nutrition_number_v1(tm->'multiplier',0,true);
      if tm->>'kind'='pal_total' then
        if multiplier not between 1.2 and 2.5 then return false; end if;
        tdee:=rmr*multiplier;
      elsif tm->>'kind'='non_exercise_plus_planned' then
        cycle:=public.nutrition_number_v1(tm->'cycleDays',0,true);
        if multiplier not between 1 and 2.5 or cycle<>trunc(cycle) or tm->'netConfirmed' is distinct from 'true'::jsonb or jsonb_typeof(tm->'netExercise') is distinct from 'array' or jsonb_array_length(tm->'netExercise')>366 then return false; end if;
        if (select count(distinct value->>'id') from jsonb_array_elements(tm->'netExercise'))<>jsonb_array_length(tm->'netExercise') then return false; end if;
        for v in select value from jsonb_array_elements(tm->'netExercise') loop
          if coalesce(length(v->>'id'),0) not between 1 and 100 then return false; end if;
          exercise:=exercise+public.nutrition_number_v1(v->'kcal');
        end loop;
        exercise:=exercise/cycle; tdee:=rmr*multiplier+exercise;
      else return false; end if;
    end if;
  end if;
  if e->>'kind'='fixed_kcal' then raw_e:=public.nutrition_number_v1(e->'kcal',0,true); energy:=raw_e;
  elsif e->>'kind'='from_macros' then raw_e:=4*public.nutrition_number_v1(pr->'grams')+9*public.nutrition_number_v1(f->'grams')+4*public.nutrition_number_v1(c->'grams'); energy:=raw_e;
  else
    delta:=case e->>'kind' when 'preset_percent' then public.nutrition_number_v1(p->'presetDeltaRatio',-1000000) when 'percent' then public.nutrition_number_v1(e->'deltaRatio',-1000000) else public.nutrition_number_v1(e->'deltaKcal',-1000000)/tdee end;
    if delta< -0.25 or delta>0.15 then return false; end if;
    raw_e:=tdee*(1+delta); energy:=floor(raw_e/25+0.5)*25;
    if energy<=1200 then return false; end if;
  end if;
  if energy<=0 then return false; end if;
  case pr->>'kind'
    when 'fixed_grams' then raw_p:=public.nutrition_number_v1(pr->'grams');
    when 'body_weight' then raw_p:=public.nutrition_number_v1(b->'weightKg',0,true)*public.nutrition_number_v1(pr->'coefficient',0,true);
    when 'ffm' then
      if pr->'contextConfirmed' is distinct from 'true'::jsonb then return false; end if;
      raw_p:=ffm*public.nutrition_number_v1(pr->'coefficient',0,true);
    when 'reference_weight' then
      if coalesce(length(trim(pr->>'sourceLabel')),0) not between 1 and 200 then return false; end if;
      raw_p:=public.nutrition_number_v1(pr->'weightKg',0,true)*public.nutrition_number_v1(pr->'coefficient',0,true);
    else return false;
  end case;
  protein:=case when pr->>'kind'='fixed_grams' then raw_p else floor(raw_p/5+0.5)*5 end;
  if pr->>'kind'<>'fixed_grams' and protein>300 then return false; end if;
  if w is not null and h is not null and w/power(h/100,2)<18.5 then return false; end if;
  case f->>'kind'
    when 'fixed_grams' then raw_f:=public.nutrition_number_v1(f->'grams'); selected_f:=raw_f; fat:=raw_f;
    when 'body_weight' then
      if f->'minimumEnergyShare' is distinct from '0.2'::jsonb then return false; end if;
      raw_f:=public.nutrition_number_v1(b->'weightKg',0,true)*public.nutrition_number_v1(f->'coefficient',0,true); selected_f:=greatest(raw_f,0.2*energy/9); fat:=ceil(selected_f/5)*5;
    when 'energy_share' then
      ratio:=public.nutrition_number_v1(f->'share',0,true); if ratio not between 0.2 and 0.35 then return false; end if;
      raw_f:=energy*ratio/9; selected_f:=raw_f; fat:=ceil(raw_f/5)*5;
    else return false;
  end case;
  carbs:=(energy-4*protein-9*fat)/4;
  if carbs<=0 or not public.valid_tre_totals_v1(target) or r->'candidateTarget' is distinct from target then return false; end if;
  if abs(public.nutrition_number_v1(target->'kcal')-energy)>0.000001 or abs(public.nutrition_number_v1(target->'protein')-protein)>0.000001
    or abs(public.nutrition_number_v1(target->'fat')-fat)>0.000001 or abs(public.nutrition_number_v1(target->'carbs')-carbs)>0.000001 then return false; end if;
  if rmr is null then if r->'expenditure'->'rmrKcal' is distinct from 'null'::jsonb then return false; end if;
  elsif abs(public.nutrition_number_v1(r->'expenditure'->'rmrKcal')-rmr)>0.000001 then return false; end if;
  if tdee is null then if r->'expenditure'->'tdeeKcal' is distinct from 'null'::jsonb then return false; end if;
  elsif abs(public.nutrition_number_v1(r->'expenditure'->'tdeeKcal')-tdee)>0.000001 then return false; end if;
  if r->'expenditure'->>'source' is distinct from (case when manual_e then 'not_used' else tm->>'kind' end) then return false; end if;
  if abs(public.nutrition_number_v1(r->'rawValues'->'rawEnergyKcal')-raw_e)>0.000001 or abs(public.nutrition_number_v1(r->'rawValues'->'rawProteinG')-raw_p)>0.000001
    or abs(public.nutrition_number_v1(r->'rawValues'->'rawFatG')-raw_f)>0.000001 or r->'rawValues'->'fatFloorApplied' is distinct from to_jsonb(selected_f>raw_f) then return false; end if;
  if ffm is not null and abs(public.nutrition_number_v1(r->'rawValues'->'ffmKg')-ffm)>0.000001 then return false; end if;
  if f->>'kind'='body_weight' and abs(public.nutrition_number_v1(r->'rawValues'->'fatEnergyFloorG')-0.2*energy/9)>0.000001 then return false; end if;
  if not manual_e and tm->>'kind'='non_exercise_plus_planned' and abs(public.nutrition_number_v1(r->'rawValues'->'averageExerciseKcalPerDay')-exercise)>0.000001 then return false; end if;
  if tdee is not null and (abs(public.nutrition_number_v1(r->'rawValues'->'energyDeltaKcal',-1000000)-(energy-tdee))>0.000001
    or abs(public.nutrition_number_v1(r->'rawValues'->'energyDeltaRatio',-1000000)-(energy/tdee-1))>0.000001) then return false; end if;
  if coalesce(r->>'inputFingerprint','') !~ '^fnv1a64:[0-9a-f]{16}$' or jsonb_typeof(r->'trace') is distinct from 'array' or jsonb_array_length(r->'trace') not between 4 and 16
    or jsonb_typeof(r->'issues') is distinct from 'array' or jsonb_array_length(r->'issues')>50 or jsonb_typeof(r->'assumptions') is distinct from 'array' or jsonb_array_length(r->'assumptions')>50 then return false; end if;
  if exists(select 1 from jsonb_array_elements(r->'issues') where value->>'severity' is distinct from 'warning') then return false; end if;
  if (select count(distinct value->>'stepId') from jsonb_array_elements(r->'trace'))<>jsonb_array_length(r->'trace')
    or jsonb_array_length(r->'trace')<>(4+(case when ffm is not null then 1 else 0 end)+(case when rmr is not null then 1 else 0 end)+(case when tdee is not null then 1 else 0 end)+(case when f->>'kind'='body_weight' then 1 else 0 end)) then return false; end if;
  for v in select value from jsonb_array_elements(r->'trace') loop
    perform public.nutrition_number_v1(v->'rawValue'); perform public.nutrition_number_v1(v->'resolvedValue');
    if coalesce(v->>'unit','') not in ('kcal','kg','g') or coalesce(length(v->>'reason'),0)>500 or coalesce(length(v->>'formulaId'),0) not between 1 and 100 or jsonb_typeof(v->'inputRefs') is distinct from 'array' then return false; end if;
    step:=v->>'stepId';
    case step
      when 'ffm' then expected_raw:=ffm; expected_resolved:=ffm; expected_unit:='kg';
      when 'rmr' then expected_raw:=rmr; expected_resolved:=rmr; expected_unit:='kcal';
      when 'tdee' then expected_raw:=tdee; expected_resolved:=tdee; expected_unit:='kcal';
      when 'energy' then expected_raw:=raw_e; expected_resolved:=energy; expected_unit:='kcal';
      when 'protein' then expected_raw:=raw_p; expected_resolved:=protein; expected_unit:='g';
      when 'fat' then expected_raw:=raw_f; expected_resolved:=fat; expected_unit:='g';
      when 'fat_floor' then
        if f->>'kind'<>'body_weight' then return false; end if;
        expected_raw:=raw_f; expected_resolved:=selected_f; expected_unit:='g';
      when 'carbs' then expected_raw:=carbs; expected_resolved:=carbs; expected_unit:='g';
      else return false;
    end case;
    if expected_raw is null or v->>'unit'<>expected_unit or abs((v->>'rawValue')::numeric-expected_raw)>0.000001 or abs((v->>'resolvedValue')::numeric-expected_resolved)>0.000001 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function public.nutrition_number_v1(jsonb,numeric,boolean), public.validate_nutrition_snapshot_v1(jsonb) from public,anon;
grant execute on function public.nutrition_number_v1(jsonb,numeric,boolean), public.validate_nutrition_snapshot_v1(jsonb) to authenticated;

create function public.validate_tre_protocol_v2(p jsonb) returns boolean language plpgsql stable set search_path='' as $$
begin
  if p->'schemaVersion'='1'::jsonb then return not (p ? 'nutrition' or p ? 'requestId') and public.validate_tre_protocol_v1(p); end if;
  return coalesce(p->'schemaVersion'='2'::jsonb and octet_length(p::text)<=65536 and p->>'requestId'=p->>'id'
    and public.validate_tre_protocol_v1(jsonb_set(p-'nutrition'-'requestId','{schemaVersion}','1'))
    and public.validate_nutrition_snapshot_v1(p->'nutrition')
    and p->'nutrition'->'result'->'resolvedTarget'=p->'dailyTarget'
    and p->'nutrition'->'body'->>'timeZone'=p->>'timeZone'
    and (p->'nutrition'->'body'->>'calculationDate')::date<=(p->>'effectiveFrom')::date,false);
exception when others then return false;
end $$;
revoke all on function public.validate_tre_protocol_v2(jsonb) from public,anon;
grant execute on function public.validate_tre_protocol_v2(jsonb) to authenticated;

alter table public.user_plan_protocols drop constraint user_plan_protocols_schema_version_check;
alter table public.user_plan_protocols add constraint user_plan_protocols_schema_version_check check (schema_version in (1,2));
alter table public.user_plan_protocols drop constraint user_plan_protocols_config_check;
alter table public.user_plan_protocols add constraint user_plan_protocols_config_check check (public.validate_tre_protocol_v2(config) and schema_version=(config->>'schemaVersion')::smallint);

create or replace function public.activate_plan_protocol_v1(p_config jsonb,p_expected_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); previous public.user_plan_protocols%rowtype; existing public.user_plan_protocols%rowtype;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not public.validate_tre_protocol_v2(p_config) then raise exception 'invalid_protocol' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  -- UUID is also v2 requestId; retries must reuse the exact persisted config, even after later versions exist.
  select * into existing from public.user_plan_protocols where user_id=u and id=(p_config->>'id')::uuid;
  if found then
    if existing.config=p_config then return existing.config; end if;
    raise exception 'protocol_conflict' using errcode='40001';
  end if;
  select * into previous from public.user_plan_protocols where user_id=u order by effective_from desc limit 1;
  if previous.id is distinct from p_expected_id or (p_config->>'supersedesId')::uuid is distinct from p_expected_id
    or (p_config->>'version')::integer<>coalesce((previous.config->>'version')::integer,0)+1
    or (previous.id is not null and (p_config->>'effectiveFrom')::date<=previous.effective_from) then raise exception 'protocol_conflict' using errcode='40001'; end if;
  insert into public.user_plan_protocols(id,user_id,schema_version,preset_id,config,effective_from,supersedes_id,change_reason)
    values((p_config->>'id')::uuid,u,(p_config->>'schemaVersion')::smallint,p_config->>'presetId',p_config,(p_config->>'effectiveFrom')::date,p_expected_id,p_config->>'changeReason');
  return p_config;
end $$;
revoke all on function public.activate_plan_protocol_v1(jsonb,uuid) from public,anon;
grant execute on function public.activate_plan_protocol_v1(jsonb,uuid) to authenticated;

-- Keep the existing validator and its meal/food/date checks. Its only changed dependency is the protocol envelope.
-- pg_get_functiondef preserves the exact installed v4 body instead of duplicating a second validator implementation.
do $$ declare definition text;
begin
  definition:=pg_get_functiondef('public.validate_plan_document_v3(date,jsonb,jsonb,uuid)'::regprocedure);
  if position('public.validate_tre_protocol_v1(snapshot)' in definition)=0 then raise exception 'unexpected_v4_validator_definition'; end if;
  execute replace(definition,'public.validate_tre_protocol_v1(snapshot)','public.validate_tre_protocol_v2(snapshot)');
end $$;

create function public.guard_nutrition_snapshots_v1() returns trigger language plpgsql security invoker set search_path='' as $$
declare snapshot jsonb; protocol jsonb; reference_id uuid;
begin
  if tg_table_name='daily_plans' then
    if new.profile->'protocolSnapshot'->>'schemaVersion'='2' then
      snapshot:=new.profile->'protocolSnapshot'->'nutrition';
      if new.result->'targetResolution' is distinct from snapshot->'result' or new.result->'dailyTarget' is distinct from snapshot->'result'->'resolvedTarget' then raise exception 'nutrition_result_mismatch' using errcode='22023'; end if;
    end if;
  elsif new.actual ? 'targetProtocolSnapshot' then
    protocol:=new.actual->'targetProtocolSnapshot'; reference_id:=(protocol->>'id')::uuid;
    if not public.validate_tre_protocol_v2(protocol) or (protocol->>'effectiveFrom')::date>new.plan_date
      or not exists(select 1 from public.user_plan_protocols where user_id=new.user_id and id=reference_id and config=protocol)
      or new.target is distinct from protocol->'dailyTarget' then raise exception 'invalid_actual_target_protocol' using errcode='42501'; end if;
    if tg_op='UPDATE' and old.actual ? 'targetProtocolSnapshot' and old.actual->'targetProtocolSnapshot' is distinct from protocol then raise exception 'frozen_actual_target_protocol' using errcode='40001'; end if;
  elsif tg_op='UPDATE' and old.actual ? 'targetProtocolSnapshot' then
    raise exception 'frozen_actual_target_protocol' using errcode='40001';
  end if;
  return new;
end $$;
revoke all on function public.guard_nutrition_snapshots_v1() from public,anon;
grant execute on function public.guard_nutrition_snapshots_v1() to authenticated;
create trigger protect_nutrition_plan before insert or update on public.daily_plans for each row execute function public.guard_nutrition_snapshots_v1();
create trigger protect_nutrition_actual before insert or update on public.daily_checkins for each row execute function public.guard_nutrition_snapshots_v1();
