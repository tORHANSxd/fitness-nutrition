alter table public.foods
  add column if not exists archived_at timestamptz;

alter table public.body_logs
  add column if not exists body_fat_pct numeric(5, 2);

alter table public.daily_plans
  add column if not exists schema_version smallint not null default 1,
  add column if not exists algorithm_version text,
  add column if not exists integrity_flags text[] not null default '{}';

alter table public.planner_templates
  add column if not exists schema_version smallint not null default 1,
  add column if not exists fingerprint text;

alter table public.profiles
  add column if not exists heatmap_palette text not null default 'red-positive';

update public.profiles
set heatmap_palette = preferences ->> 'heatmapPalette'
where preferences ->> 'heatmapPalette' in ('red-positive', 'green-positive');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_heatmap_palette_check'
  ) then
    alter table public.profiles
      add constraint profiles_heatmap_palette_check
      check (heatmap_palette in ('red-positive', 'green-positive'));
  end if;
end
$$;

create table if not exists public.planner_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_date date not null,
  profile_snapshot jsonb not null,
  meals jsonb not null,
  schema_version smallint not null default 2 check (schema_version > 0),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deload_weeks (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

insert into public.deload_weeks (user_id, week_start)
select profile.id, week.value::date
from public.profiles as profile
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(profile.preferences -> 'deloadWeeks') = 'array'
      then profile.preferences -> 'deloadWeeks'
    else '[]'::jsonb
  end
) as week(value)
where week.value ~ '^\d{4}-\d{2}-\d{2}$'
on conflict (user_id, week_start) do nothing;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.health_sync_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

revoke all on private.health_sync_credentials from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.health_sync_credentials to service_role;

create index if not exists foods_user_active_idx
  on public.foods (user_id, category, name)
  where archived_at is null;

create index if not exists planner_templates_user_created_idx
  on public.planner_templates (user_id, created_at desc);

create index if not exists daily_plans_user_date_id_idx
  on public.daily_plans (user_id, plan_date desc, id desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- The legacy token was readable by every authenticated browser session.
-- There is no server-side refresh flow to migrate it safely, so require re-authorization.
update public.profiles
set preferences = preferences - 'healthSyncToken'
where preferences ? 'healthSyncToken';

drop trigger if exists set_planner_drafts_updated_at on public.planner_drafts;
create trigger set_planner_drafts_updated_at
before update on public.planner_drafts
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_plans_updated_at on public.daily_plans;
create trigger set_daily_plans_updated_at
before update on public.daily_plans
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_checkins_updated_at on public.daily_checkins;
create trigger set_daily_checkins_updated_at
before update on public.daily_checkins
for each row execute function public.set_updated_at();

drop trigger if exists set_body_logs_updated_at on public.body_logs;
create trigger set_body_logs_updated_at
before update on public.body_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_foods_updated_at on public.foods;
create trigger set_foods_updated_at
before update on public.foods
for each row execute function public.set_updated_at();

drop trigger if exists set_food_overrides_updated_at on public.food_overrides;
create trigger set_food_overrides_updated_at
before update on public.food_overrides
for each row execute function public.set_updated_at();

drop trigger if exists set_planner_templates_updated_at on public.planner_templates;
create trigger set_planner_templates_updated_at
before update on public.planner_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_workout_sessions_updated_at on public.workout_sessions;
create trigger set_workout_sessions_updated_at
before update on public.workout_sessions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.foods enable row level security;
alter table public.food_overrides enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.body_logs enable row level security;
alter table public.measurement_logs enable row level security;
alter table public.plan_day_overrides enable row level security;
alter table public.plan_instances enable row level security;
alter table public.planner_templates enable row level security;
alter table public.training_logs enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.planner_drafts enable row level security;
alter table public.deload_weeks enable row level security;

drop policy if exists "read own profile" on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
create policy "read own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "insert own profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
create policy "update own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "read public and own foods" on public.foods;
drop policy if exists "insert own foods" on public.foods;
drop policy if exists "update own foods" on public.foods;
drop policy if exists "delete own foods" on public.foods;
create policy "read public and own foods"
on public.foods for select to authenticated
using (user_id is null or (select auth.uid()) = user_id);
create policy "insert own foods"
on public.foods for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "update own foods"
on public.foods for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "read own food overrides" on public.food_overrides;
drop policy if exists "insert own food overrides" on public.food_overrides;
drop policy if exists "update own food overrides" on public.food_overrides;
drop policy if exists "delete own food overrides" on public.food_overrides;
create policy "read own food overrides"
on public.food_overrides for select to authenticated
using ((select auth.uid()) = user_id);
create policy "insert own food overrides"
on public.food_overrides for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "update own food overrides"
on public.food_overrides for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "delete own food overrides"
on public.food_overrides for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "own daily plans" on public.daily_plans;
drop policy if exists "read own plans" on public.daily_plans;
drop policy if exists "insert own plans" on public.daily_plans;
drop policy if exists "update own plans" on public.daily_plans;
drop policy if exists "delete own plans" on public.daily_plans;
create policy "authenticated users manage own daily plans"
on public.daily_plans for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "own daily checkins" on public.daily_checkins;
create policy "authenticated users manage own daily checkins"
on public.daily_checkins for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "own body logs" on public.body_logs;
create policy "authenticated users manage own body logs"
on public.body_logs for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "own measurement logs" on public.measurement_logs;
create policy "authenticated users manage own measurement logs"
on public.measurement_logs for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "own plan day overrides" on public.plan_day_overrides;
create policy "authenticated users manage own plan day overrides"
on public.plan_day_overrides for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "own plan instances" on public.plan_instances;
create policy "authenticated users manage own plan instances"
on public.plan_instances for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "own planner templates" on public.planner_templates;
create policy "authenticated users manage own planner templates"
on public.planner_templates for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "own training logs" on public.training_logs;
create policy "authenticated users manage own training logs"
on public.training_logs for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "read own workout sessions" on public.workout_sessions;
drop policy if exists "insert own workout sessions" on public.workout_sessions;
drop policy if exists "update own workout sessions" on public.workout_sessions;
drop policy if exists "delete own workout sessions" on public.workout_sessions;
create policy "authenticated users manage own workout sessions"
on public.workout_sessions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "authenticated users manage own planner draft" on public.planner_drafts;
create policy "authenticated users manage own planner draft"
on public.planner_drafts for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "authenticated users manage own deload weeks" on public.deload_weeks;
create policy "authenticated users manage own deload weeks"
on public.deload_weeks for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Remove inherited/default Data API privileges before granting the exact
-- authenticated surface below. This also keeps new Data API defaults harmless.
revoke all on table
  public.profiles,
  public.foods,
  public.food_overrides,
  public.daily_plans,
  public.daily_checkins,
  public.body_logs,
  public.measurement_logs,
  public.plan_day_overrides,
  public.plan_instances,
  public.planner_templates,
  public.training_logs,
  public.workout_sessions,
  public.planner_drafts,
  public.deload_weeks
from public, anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.foods to authenticated;
grant select, insert, update, delete on public.food_overrides to authenticated;
grant select, insert, update, delete on public.daily_plans to authenticated;
grant select, insert, update, delete on public.daily_checkins to authenticated;
grant select, insert, update, delete on public.body_logs to authenticated;
grant select, insert, update, delete on public.measurement_logs to authenticated;
grant select, insert, update, delete on public.plan_day_overrides to authenticated;
grant select, insert, update, delete on public.plan_instances to authenticated;
grant select, insert, update, delete on public.planner_templates to authenticated;
grant select, insert, update, delete on public.training_logs to authenticated;
grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.planner_drafts to authenticated;
grant select, insert, delete on public.deload_weeks to authenticated;

grant all on table
  public.profiles,
  public.foods,
  public.food_overrides,
  public.daily_plans,
  public.daily_checkins,
  public.body_logs,
  public.measurement_logs,
  public.plan_day_overrides,
  public.plan_instances,
  public.planner_templates,
  public.training_logs,
  public.workout_sessions,
  public.planner_drafts,
  public.deload_weeks
to service_role;
grant all on all sequences in schema public to service_role;

revoke all on public.food_import_cache from anon, authenticated;
grant all on public.food_import_cache to service_role;

drop policy if exists "deny browser access to legacy food import cache" on public.food_import_cache;
create policy "deny browser access to legacy food import cache"
on public.food_import_cache for all to authenticated
using (false)
with check (false);

create or replace function public.save_planner_draft_v2(
  p_plan_date date,
  p_profile_snapshot jsonb,
  p_meals jsonb,
  p_schema_version smallint default 2,
  p_expected_revision bigint default null,
  p_force boolean default false
)
returns table (revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_schema_version <> 2 then
    raise exception 'unsupported_draft_schema' using errcode = '22023';
  end if;

  if p_force then
    insert into public.planner_drafts as draft (
      user_id,
      plan_date,
      profile_snapshot,
      meals,
      schema_version,
      revision
    ) values (
      v_user_id,
      p_plan_date,
      p_profile_snapshot,
      p_meals,
      p_schema_version,
      1
    )
    on conflict (user_id) do update set
      plan_date = excluded.plan_date,
      profile_snapshot = excluded.profile_snapshot,
      meals = excluded.meals,
      schema_version = excluded.schema_version,
      revision = draft.revision + 1
    returning draft.revision, draft.updated_at
      into v_revision, v_updated_at;
  elsif p_expected_revision is null then
    insert into public.planner_drafts as draft (
      user_id,
      plan_date,
      profile_snapshot,
      meals,
      schema_version,
      revision
    ) values (
      v_user_id,
      p_plan_date,
      p_profile_snapshot,
      p_meals,
      p_schema_version,
      1
    )
    on conflict (user_id) do nothing
    returning draft.revision, draft.updated_at
      into v_revision, v_updated_at;
  else
    update public.planner_drafts as draft
    set
      plan_date = p_plan_date,
      profile_snapshot = p_profile_snapshot,
      meals = p_meals,
      schema_version = p_schema_version,
      revision = draft.revision + 1
    where draft.user_id = v_user_id
      and draft.revision = p_expected_revision
    returning draft.revision, draft.updated_at
      into v_revision, v_updated_at;
  end if;

  if v_revision is null then
    raise exception 'draft_conflict' using errcode = '40001';
  end if;

  update public.profiles
  set preferences = jsonb_set(
    coalesce(preferences, '{}'::jsonb),
    '{plannerDraft}',
    jsonb_build_object(
      'profile', p_profile_snapshot,
      'meals', p_meals,
      'updatedAt', v_updated_at
    ),
    true
  )
  where id = v_user_id;

  return query select v_revision, v_updated_at;
end;
$$;

revoke all on function public.save_planner_draft_v2(date, jsonb, jsonb, smallint, bigint, boolean)
  from public, anon;
grant execute on function public.save_planner_draft_v2(date, jsonb, jsonb, smallint, bigint, boolean)
  to authenticated;

create or replace function public.set_deload_week_v1(
  p_week_start date,
  p_enabled boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_legacy_weeks jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_enabled then
    insert into public.deload_weeks (user_id, week_start)
    values (v_user_id, p_week_start)
    on conflict (user_id, week_start) do nothing;
  else
    delete from public.deload_weeks
    where user_id = v_user_id
      and week_start = p_week_start;
  end if;

  select coalesce(
    jsonb_agg(to_char(week_start, 'YYYY-MM-DD') order by week_start),
    '[]'::jsonb
  )
  into v_legacy_weeks
  from public.deload_weeks
  where user_id = v_user_id;

  update public.profiles
  set preferences = jsonb_set(
    coalesce(preferences, '{}'::jsonb),
    '{deloadWeeks}',
    v_legacy_weeks,
    true
  )
  where id = v_user_id;
end;
$$;

revoke all on function public.set_deload_week_v1(date, boolean)
  from public, anon;
grant execute on function public.set_deload_week_v1(date, boolean)
  to authenticated;

create or replace function public.complete_daily_record_v2(
  p_plan_date date,
  p_profile jsonb,
  p_meals jsonb,
  p_result jsonb,
  p_plan_schema_version smallint,
  p_algorithm_version text,
  p_integrity_flags text[],
  p_actual jsonb,
  p_target jsonb,
  p_completed boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_checkin public.daily_checkins%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_plan_schema_version <> 2 then
    raise exception 'unsupported_plan_schema' using errcode = '22023';
  end if;
  if p_profile ->> 'planDate' is distinct from p_plan_date::text
    or jsonb_typeof(p_meals) is distinct from 'array'
    or jsonb_typeof(p_result) is distinct from 'object'
    or p_actual ->> 'version' is distinct from '2' then
    raise exception 'invalid_daily_record_document' using errcode = '22023';
  end if;

  insert into public.daily_plans as plan (
    user_id,
    plan_date,
    profile,
    meals,
    result,
    schema_version,
    algorithm_version,
    integrity_flags
  ) values (
    v_user_id,
    p_plan_date,
    p_profile,
    p_meals,
    p_result,
    p_plan_schema_version,
    p_algorithm_version,
    coalesce(p_integrity_flags, '{}')
  )
  on conflict (user_id, plan_date) do update set
    profile = excluded.profile,
    meals = excluded.meals,
    result = excluded.result,
    schema_version = excluded.schema_version,
    algorithm_version = excluded.algorithm_version,
    integrity_flags = excluded.integrity_flags;

  insert into public.daily_checkins as checkin (
    user_id,
    plan_date,
    actual,
    target,
    completed
  ) values (
    v_user_id,
    p_plan_date,
    p_actual,
    p_target,
    p_completed
  )
  on conflict (user_id, plan_date) do update set
    actual = excluded.actual,
    target = excluded.target,
    completed = excluded.completed
  returning checkin.* into v_checkin;

  return to_jsonb(v_checkin);
end;
$$;

revoke all on function public.complete_daily_record_v2(
  date, jsonb, jsonb, jsonb, smallint, text, text[], jsonb, jsonb, boolean
) from public, anon;
grant execute on function public.complete_daily_record_v2(
  date, jsonb, jsonb, jsonb, smallint, text, text[], jsonb, jsonb, boolean
) to authenticated;

create or replace function public.import_user_foods_v1(
  p_rows jsonb,
  p_atomic boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item jsonb;
  v_index integer := 0;
  v_inserted integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows_must_be_an_array' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      if jsonb_typeof(v_item) is distinct from 'object'
        or nullif(btrim(v_item ->> 'name'), '') is null
        or v_item ->> 'category' not in ('主食', '蔬菜', '水果', '肉类', '补剂', '坚果', '食物配料')
        or v_item ->> 'weight_basis' not in ('raw', 'cooked', 'none')
        or jsonb_typeof(v_item -> 'kcal_per_100g') is distinct from 'number'
        or jsonb_typeof(v_item -> 'fat_per_100g') is distinct from 'number'
        or jsonb_typeof(v_item -> 'carbs_per_100g') is distinct from 'number'
        or jsonb_typeof(v_item -> 'protein_per_100g') is distinct from 'number'
        or (v_item ->> 'kcal_per_100g')::numeric < 0
        or (v_item ->> 'fat_per_100g')::numeric < 0
        or (v_item ->> 'carbs_per_100g')::numeric < 0
        or (v_item ->> 'protein_per_100g')::numeric < 0
        or (
          v_item ? 'cooked_raw_ratio'
          and v_item -> 'cooked_raw_ratio' <> 'null'::jsonb
          and (
            jsonb_typeof(v_item -> 'cooked_raw_ratio') is distinct from 'number'
            or (v_item ->> 'cooked_raw_ratio')::numeric <= 0
          )
        ) then
        raise exception 'invalid_food_row_%', v_index using errcode = '22023';
      end if;

      insert into public.foods (
        user_id,
        name,
        category,
        kcal_per_100g,
        fat_per_100g,
        carbs_per_100g,
        protein_per_100g,
        weight_basis,
        cooked_raw_ratio,
        source
      ) values (
        v_user_id,
        btrim(v_item ->> 'name'),
        v_item ->> 'category',
        (v_item ->> 'kcal_per_100g')::numeric,
        (v_item ->> 'fat_per_100g')::numeric,
        (v_item ->> 'carbs_per_100g')::numeric,
        (v_item ->> 'protein_per_100g')::numeric,
        v_item ->> 'weight_basis',
        case
          when v_item -> 'cooked_raw_ratio' is null or v_item -> 'cooked_raw_ratio' = 'null'::jsonb then null
          else (v_item ->> 'cooked_raw_ratio')::numeric
        end,
        'user'
      );
      v_inserted := v_inserted + 1;
    exception when others then
      if p_atomic then
        raise;
      end if;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'message', sqlerrm
      ));
    end;
    v_index := v_index + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'errors', v_errors);
end;
$$;

revoke all on function public.import_user_foods_v1(jsonb, boolean)
  from public, anon;
grant execute on function public.import_user_foods_v1(jsonb, boolean)
  to authenticated;
