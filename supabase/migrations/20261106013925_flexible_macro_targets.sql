-- Exact custom macro rules. Existing v5.0 snapshots and two-field daily adjustments keep their semantics.
create function public.nutrition_resolve_macros_v1(energy numeric, methods jsonb, weight_kg numeric, ffm_kg numeric)
returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; m jsonb; amount numeric; ratio numeric; remaining numeric; residual text;
  target jsonb:=jsonb_build_object('kcal',energy,'protein',0,'fat',0,'carbs',0);
begin
  perform public.nutrition_number_v1(to_jsonb(energy),0,true);
  foreach k in array array['protein','fat','carbs'] loop
    m:=methods->k;
    if jsonb_typeof(m) is distinct from 'object' then raise exception 'invalid_macro_method' using errcode='22023'; end if;
    case m->>'kind'
      when 'fixed_grams' then amount:=public.nutrition_number_v1(m->'grams');
      when 'body_weight' then amount:=public.nutrition_number_v1(to_jsonb(weight_kg),0,true)*public.nutrition_number_v1(m->'coefficient');
      when 'ffm' then amount:=public.nutrition_number_v1(to_jsonb(ffm_kg),0,true)*public.nutrition_number_v1(m->'coefficient');
      when 'reference_weight' then
        if k<>'protein' or jsonb_typeof(m->'sourceLabel') is distinct from 'string' or coalesce(length(trim(m->>'sourceLabel')),0) not between 1 and 200 then raise exception 'invalid_reference_weight' using errcode='22023'; end if;
        amount:=public.nutrition_number_v1(m->'weightKg',0,true)*public.nutrition_number_v1(m->'coefficient');
      when 'energy_share' then
        ratio:=public.nutrition_number_v1(m->'share');
        if k<>'fat' or ratio>1 then raise exception 'invalid_fat_share' using errcode='22023'; end if;
        amount:=energy*ratio/9;
      when 'residual' then
        if residual is not null then raise exception 'multiple_residual_macros' using errcode='22023'; end if;
        residual:=k; amount:=0;
      else raise exception 'invalid_macro_method' using errcode='22023';
    end case;
    perform public.nutrition_number_v1(to_jsonb(amount));
    target:=jsonb_set(target,array[k],to_jsonb(amount));
  end loop;
  remaining:=energy-(target->>'protein')::numeric*4-(target->>'fat')::numeric*9-(target->>'carbs')::numeric*4;
  if residual is not null then
    if remaining < -0.000001 then raise exception 'daily_macros_exceed_energy' using errcode='22023'; end if;
    target:=jsonb_set(target,array[residual],to_jsonb(greatest(0,remaining)/(case when residual='fat' then 9 else 4 end)));
  elsif abs(remaining)>0.000001 then raise exception 'macro_energy_mismatch' using errcode='22023'; end if;
  return target;
end $$;
revoke all on function public.nutrition_resolve_macros_v1(numeric,jsonb,numeric,numeric) from public,anon;
grant execute on function public.nutrition_resolve_macros_v1(numeric,jsonb,numeric,numeric) to authenticated;

create or replace function public.nutrition_adjust_daily_target_v1(t jsonb, a jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare energy numeric; carbs numeric; m jsonb; w numeric; bf numeric; ffm numeric;
begin
  if a is null then return t; end if;
  if jsonb_typeof(a) is distinct from 'object' or not public.valid_tre_totals_v1(t) then raise exception 'invalid_daily_energy_adjustment' using errcode='22023'; end if;
  if a ? 'targetKcal' then
    energy:=public.nutrition_number_v1(a->'targetKcal',0,true);
    if energy>10000 or a ? 'tdeeKcal' or a ? 'deficitKcal' then raise exception 'invalid_daily_energy_adjustment' using errcode='22023'; end if;
  else
  if jsonb_typeof(a->'tdeeKcal') is distinct from 'number'
    or jsonb_typeof(a->'deficitKcal') is distinct from 'number'
    or (a->>'tdeeKcal')::numeric<=0 or (a->>'tdeeKcal')::numeric>10000
    or (a->>'deficitKcal')::numeric<0 or (a->>'deficitKcal')::numeric>=(a->>'tdeeKcal')::numeric then raise exception 'invalid_daily_energy_adjustment' using errcode='22023'; end if;
  energy:=(a->>'tdeeKcal')::numeric-(a->>'deficitKcal')::numeric;
  end if;
  if a ? 'macroInputs' then
    m:=a->'macroInputs';
    if jsonb_typeof(m) is distinct from 'object' or m->'version' is distinct from '1'::jsonb or not (m ?& array['weightKg','bodyFatPct']) then raise exception 'invalid_daily_macro_inputs' using errcode='22023'; end if;
    if m->'weightKg' is distinct from 'null'::jsonb then w:=public.nutrition_number_v1(m->'weightKg',0,true); end if;
    if m->'bodyFatPct' is distinct from 'null'::jsonb then
      bf:=public.nutrition_number_v1(m->'bodyFatPct');
      if bf>=100 then raise exception 'invalid_body_fat' using errcode='22023'; end if;
    end if;
    if m ? 'ffmInput' and coalesce(m->>'ffmInput','') not in ('body_fat','direct') then raise exception 'invalid_ffm_input' using errcode='22023'; end if;
    if m->>'ffmKg' is not null then
      ffm:=public.nutrition_number_v1(m->'ffmKg',0,true);
      if w is null or ffm>w then raise exception 'invalid_ffm' using errcode='22023'; end if;
    end if;
    return public.nutrition_resolve_macros_v1(energy,m,w,case when m->>'ffmInput'='direct' then ffm else w*(1-bf/100) end);
  end if;
  carbs:=(energy-(t->>'protein')::numeric*4-(t->>'fat')::numeric*9)/4;
  if carbs<0 then raise exception 'daily_macros_exceed_energy' using errcode='22023'; end if;
  return jsonb_build_object('kcal',energy,'protein',t->'protein','fat',t->'fat','carbs',carbs);
end $$;

create or replace function public.validate_nutrition_snapshot_v1(s jsonb)
returns boolean language plpgsql stable set search_path='' as $$
declare p jsonb:=s->'policy'; b jsonb:=s->'body'; r jsonb:=s->'result'; target jsonb:=r->'resolvedTarget';
  scope jsonb:=b->'scope'; e jsonb:=p->'energy'; pr jsonb:=p->'protein'; f jsonb:=p->'fat'; c jsonb:=p->'carbs'; tm jsonb:=p->'tdee'; rm jsonb:=p->'rmr';
  dt date; age_years numeric; w numeric; h numeric; ffm numeric; paired numeric; measured date; label text;
  preset_delta numeric; preset_p numeric; preset_f numeric; step text; expected_raw numeric; expected_resolved numeric; expected_unit text;
  rmr numeric; tdee numeric; raw_e numeric; energy numeric; raw_p numeric; protein numeric; raw_f numeric; selected_f numeric; fat numeric; carbs numeric;
  exercise numeric:=0; cycle numeric; multiplier numeric; delta numeric; ratio numeric; k text; v jsonb; manual_e boolean; uses_ffm boolean;
  flexible boolean:=p->>'policyVersion'='nutrition-goals-v5.1'; calculated jsonb;
begin
  if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text)>65536 or s->'schemaVersion' is distinct from '1'::jsonb or s->>'source' is distinct from 'user_confirmed'
    or p->'schemaVersion' is distinct from '1'::jsonb or coalesce(p->>'policyVersion','') not in ('nutrition-goals-v5.0','nutrition-goals-v5.1') or p->'presetVersion' is distinct from '1'::jsonb
    or r->>'algorithmVersion' is distinct from (case when flexible then 'nutrition-v5.1' else 'nutrition-v5.0' end) or r->>'policyVersion' is distinct from p->>'policyVersion' or r->'presetVersion' is distinct from p->'presetVersion'
    or p->>'refreshMode' is distinct from 'preview_then_confirm' or r->>'status' is distinct from 'valid'
    or coalesce(p->>'presetId','') not in ('cut_recomp','cut_lean','recomp','lean_gain','maintain','custom') then return false; end if;
  if flexible and p->>'presetId'<>'custom' then return false; end if;
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
    or (coalesce(pr->>'kind','') not in ('body_weight','ffm','reference_weight','fixed_grams') and not (flexible and pr->>'kind'='residual'))
    or (coalesce(f->>'kind','') not in ('body_weight','energy_share','fixed_grams') and not (flexible and f->>'kind' in ('ffm','residual')))
    or (coalesce(c->>'kind','') not in ('residual','fixed_grams') and not (flexible and c->>'kind' in ('body_weight','ffm'))) then return false; end if;
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
  elsif not flexible and c->>'kind'<>'residual' then return false; end if;
  if tm->>'kind'='pal_total' and (tm->'includesExercise' is distinct from 'true'::jsonb or tm ? 'exerciseKcal' or tm ? 'netExercise' or p ? 'exerciseKcal') then return false; end if;
  uses_ffm:=pr->>'kind'='ffm' or (flexible and (f->>'kind'='ffm' or c->>'kind'='ffm')) or (not manual_e and tm->>'kind'<>'manual' and rm->>'kind'='cunningham_1980');
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
    raw_e:=case when flexible and e->>'kind'='delta_kcal' then tdee+public.nutrition_number_v1(e->'deltaKcal',-1000000) else tdee*(1+delta) end;
    energy:=case when flexible then raw_e else floor(raw_e/25+0.5)*25 end;
    if energy<=1200 then return false; end if;
  end if;
  if energy<=0 then return false; end if;
  if flexible then
    calculated:=public.nutrition_resolve_macros_v1(energy,p,w,ffm);
    protein:=(calculated->>'protein')::numeric; fat:=(calculated->>'fat')::numeric; carbs:=(calculated->>'carbs')::numeric;
    raw_p:=protein; raw_f:=fat; selected_f:=fat;
    if pr->>'kind'<>'fixed_grams' and protein>300 then return false; end if;
    if w is not null and h is not null and w/power(h/100,2)<18.5 then return false; end if;
  else
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
  end if;
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
  if not flexible and f->>'kind'='body_weight' and abs(public.nutrition_number_v1(r->'rawValues'->'fatEnergyFloorG')-0.2*energy/9)>0.000001 then return false; end if;
  if not manual_e and tm->>'kind'='non_exercise_plus_planned' and abs(public.nutrition_number_v1(r->'rawValues'->'averageExerciseKcalPerDay')-exercise)>0.000001 then return false; end if;
  if tdee is not null and (abs(public.nutrition_number_v1(r->'rawValues'->'energyDeltaKcal',-1000000)-(energy-tdee))>0.000001
    or abs(public.nutrition_number_v1(r->'rawValues'->'energyDeltaRatio',-1000000)-(energy/tdee-1))>0.000001) then return false; end if;
  if coalesce(r->>'inputFingerprint','') !~ '^fnv1a64:[0-9a-f]{16}$' or jsonb_typeof(r->'trace') is distinct from 'array' or jsonb_array_length(r->'trace') not between 4 and 16
    or jsonb_typeof(r->'issues') is distinct from 'array' or jsonb_array_length(r->'issues')>50 or jsonb_typeof(r->'assumptions') is distinct from 'array' or jsonb_array_length(r->'assumptions')>50 then return false; end if;
  if exists(select 1 from jsonb_array_elements(r->'issues') where value->>'severity' is distinct from 'warning') then return false; end if;
  if (select count(distinct value->>'stepId') from jsonb_array_elements(r->'trace'))<>jsonb_array_length(r->'trace')
    or jsonb_array_length(r->'trace')<>(4+(case when ffm is not null then 1 else 0 end)+(case when rmr is not null then 1 else 0 end)+(case when tdee is not null then 1 else 0 end)+(case when not flexible and f->>'kind'='body_weight' then 1 else 0 end)) then return false; end if;
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
        if flexible or f->>'kind'<>'body_weight' then return false; end if;
        expected_raw:=raw_f; expected_resolved:=selected_f; expected_unit:='g';
      when 'carbs' then expected_raw:=carbs; expected_resolved:=carbs; expected_unit:='g';
      else return false;
    end case;
    if expected_raw is null or v->>'unit'<>expected_unit or abs((v->>'rawValue')::numeric-expected_raw)>0.000001 or abs((v->>'resolvedValue')::numeric-expected_resolved)>0.000001 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function public.guard_nutrition_snapshots_v1() returns trigger language plpgsql security invoker set search_path='' as $$
declare snapshot jsonb; protocol jsonb; reference_id uuid; expected jsonb; adjustment jsonb; frozen_tdee numeric;
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
    if adjustment ? 'targetKcal' and protocol->'nutrition' is not null then
      frozen_tdee:=(protocol#>>'{nutrition,result,expenditure,tdeeKcal}')::numeric;
      if abs(public.nutrition_number_v1(new.result->'tdee')-coalesce(frozen_tdee,0))>0.000001
        or abs(public.nutrition_number_v1(new.result->'plannedCalorieDelta',-1000000)-(case when frozen_tdee is null then 0 else (adjustment->>'targetKcal')::numeric-frozen_tdee end))>0.000001 then raise exception 'nutrition_expenditure_mismatch' using errcode='22023'; end if;
    end if;
    if adjustment ? 'tdeeKcal' and (new.result->'tdee' is distinct from adjustment->'tdeeKcal'
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
