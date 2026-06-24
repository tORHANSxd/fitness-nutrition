-- 由线上 Supabase (project ytjyzsvcenhfjfoowpcp / fitness-nutrition) 自省导出，反映当前实际库结构。
create extension if not exists "pgcrypto";

create table if not exists public.body_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  plan_date date not null,
  weight_kg numeric(6,2),
  waist_cm numeric(6,2),
  chest_cm numeric(6,2),
  hip_cm numeric(6,2),
  shoulder_cm numeric(6,2),
  upper_arm_cm numeric(6,2),
  thigh_cm numeric(6,2),
  calf_cm numeric(6,2),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.body_logs add constraint body_logs_pkey PRIMARY KEY (id);
alter table public.body_logs add constraint body_logs_user_id_plan_date_key UNIQUE (user_id, plan_date);
alter table public.body_logs add constraint body_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

create table if not exists public.daily_checkins (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  plan_date date not null,
  actual jsonb not null,
  vegetable_grams numeric(7,2) not null default 0,
  water_liters numeric(5,2) not null default 0,
  steps integer not null default 0,
  post_workout_carbs numeric(7,2) not null default 0,
  post_workout_protein numeric(7,2) not null default 0,
  sleep_hours numeric(4,2) not null default 0,
  hunger_level integer,
  mood_level integer,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  target jsonb
);
alter table public.daily_checkins add constraint daily_checkins_pkey PRIMARY KEY (id);
alter table public.daily_checkins add constraint daily_checkins_user_id_plan_date_key UNIQUE (user_id, plan_date);
alter table public.daily_checkins add constraint daily_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.daily_checkins add constraint daily_checkins_hunger_level_check CHECK (((hunger_level IS NULL) OR ((hunger_level >= 1) AND (hunger_level <= 5))));
alter table public.daily_checkins add constraint daily_checkins_mood_level_check CHECK (((mood_level IS NULL) OR ((mood_level >= 1) AND (mood_level <= 5))));

create table if not exists public.daily_plans (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  plan_date date not null,
  profile jsonb not null,
  meals jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.daily_plans add constraint daily_plans_pkey PRIMARY KEY (id);
alter table public.daily_plans add constraint daily_plans_user_id_plan_date_key UNIQUE (user_id, plan_date);
alter table public.daily_plans add constraint daily_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

create table if not exists public.food_import_cache (
  id uuid not null default gen_random_uuid(),
  provider text not null,
  query text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.food_import_cache add constraint food_import_cache_pkey PRIMARY KEY (id);
alter table public.food_import_cache add constraint food_import_cache_provider_query_key UNIQUE (provider, query);

create table if not exists public.food_overrides (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  base_food_id text not null,
  name text not null,
  category text not null,
  kcal_per_100g numeric(8,2) not null,
  fat_per_100g numeric(8,2) not null,
  carbs_per_100g numeric(8,2) not null,
  protein_per_100g numeric(8,2) not null,
  weight_basis text not null,
  cooked_raw_ratio numeric(8,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.food_overrides add constraint food_overrides_pkey PRIMARY KEY (id);
alter table public.food_overrides add constraint food_overrides_user_id_base_food_id_key UNIQUE (user_id, base_food_id);
alter table public.food_overrides add constraint food_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.food_overrides add constraint food_overrides_carbs_per_100g_check CHECK ((carbs_per_100g >= (0)::numeric));
alter table public.food_overrides add constraint food_overrides_category_check CHECK ((category = ANY (ARRAY['主食'::text, '蔬菜'::text, '水果'::text, '肉类'::text, '补剂'::text, '坚果'::text])));
alter table public.food_overrides add constraint food_overrides_cooked_raw_ratio_check CHECK (((cooked_raw_ratio IS NULL) OR (cooked_raw_ratio > (0)::numeric)));
alter table public.food_overrides add constraint food_overrides_fat_per_100g_check CHECK ((fat_per_100g >= (0)::numeric));
alter table public.food_overrides add constraint food_overrides_kcal_per_100g_check CHECK ((kcal_per_100g >= (0)::numeric));
alter table public.food_overrides add constraint food_overrides_protein_per_100g_check CHECK ((protein_per_100g >= (0)::numeric));
alter table public.food_overrides add constraint food_overrides_weight_basis_check CHECK ((weight_basis = ANY (ARRAY['raw'::text, 'cooked'::text, 'none'::text])));

create table if not exists public.foods (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  name text not null,
  category text not null,
  kcal_per_100g numeric(8,2) not null,
  fat_per_100g numeric(8,2) not null,
  carbs_per_100g numeric(8,2) not null,
  protein_per_100g numeric(8,2) not null,
  weight_basis text not null,
  cooked_raw_ratio numeric(8,3),
  source text not null default 'user'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  external_id text,
  brand text,
  serving_description text
);
alter table public.foods add constraint foods_pkey PRIMARY KEY (id);
alter table public.foods add constraint foods_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.foods add constraint foods_carbs_per_100g_check CHECK ((carbs_per_100g >= (0)::numeric));
alter table public.foods add constraint foods_category_check CHECK ((category = ANY (ARRAY['主食'::text, '蔬菜'::text, '水果'::text, '肉类'::text, '补剂'::text, '坚果'::text])));
alter table public.foods add constraint foods_cooked_raw_ratio_check CHECK (((cooked_raw_ratio IS NULL) OR (cooked_raw_ratio > (0)::numeric)));
alter table public.foods add constraint foods_fat_per_100g_check CHECK ((fat_per_100g >= (0)::numeric));
alter table public.foods add constraint foods_kcal_per_100g_check CHECK ((kcal_per_100g >= (0)::numeric));
alter table public.foods add constraint foods_protein_per_100g_check CHECK ((protein_per_100g >= (0)::numeric));
alter table public.foods add constraint foods_weight_basis_check CHECK ((weight_basis = ANY (ARRAY['raw'::text, 'cooked'::text, 'none'::text])));

create table if not exists public.measurement_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  week_start date not null,
  avg_weight_kg numeric(6,2),
  waist_cm numeric(6,2),
  chest_cm numeric(6,2),
  hip_cm numeric(6,2),
  shoulder_cm numeric(6,2),
  upper_arm_cm numeric(6,2),
  thigh_cm numeric(6,2),
  calf_cm numeric(6,2),
  photo_urls text[] not null default '{}'::text[],
  main_lifts jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.measurement_logs add constraint measurement_logs_pkey PRIMARY KEY (id);
alter table public.measurement_logs add constraint measurement_logs_user_id_week_start_key UNIQUE (user_id, week_start);
alter table public.measurement_logs add constraint measurement_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

create table if not exists public.plan_day_overrides (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  calendar_date date not null,
  plan_day_number integer not null,
  created_at timestamptz not null default now()
);
alter table public.plan_day_overrides add constraint plan_day_overrides_pkey PRIMARY KEY (id);
alter table public.plan_day_overrides add constraint plan_day_overrides_user_id_calendar_date_key UNIQUE (user_id, calendar_date);
alter table public.plan_day_overrides add constraint plan_day_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.plan_day_overrides add constraint plan_day_overrides_plan_day_number_check CHECK (((plan_day_number >= 1) AND (plan_day_number <= 84)));

create table if not exists public.plan_instances (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  start_date date not null,
  use_platform_stage boolean not null default true,
  active boolean not null default true,
  custom_targets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.plan_instances add constraint plan_instances_pkey PRIMARY KEY (id);
alter table public.plan_instances add constraint plan_instances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

create table if not exists public.planner_drafts (
  user_id uuid not null,
  profile jsonb not null,
  meals jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.planner_drafts add constraint planner_drafts_pkey PRIMARY KEY (user_id);
alter table public.planner_drafts add constraint planner_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

create table if not exists public.planner_templates (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  template_type text not null,
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.planner_templates add constraint planner_templates_pkey PRIMARY KEY (id);
alter table public.planner_templates add constraint planner_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.planner_templates add constraint planner_templates_template_type_check CHECK ((template_type = ANY (ARRAY['meal'::text, 'day'::text])));

create table if not exists public.profiles (
  id uuid not null,
  email text,
  display_name text,
  sex text,
  birth_year integer,
  height_cm numeric(6,2),
  starting_weight_kg numeric(6,2),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_sex_check CHECK ((sex = ANY (ARRAY['male'::text, 'female'::text])));

create table if not exists public.training_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  plan_date date not null,
  movement text not null,
  load_kg numeric(7,2),
  sets integer,
  reps integer,
  rpe numeric(4,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.training_logs add constraint training_logs_pkey PRIMARY KEY (id);
alter table public.training_logs add constraint training_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

create table if not exists public.workout_sessions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  session_date date not null,
  split_label text not null,
  carb_day_type text not null,
  bodyweight_kg numeric(6,2),
  recovery smallint,
  note text,
  sets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workout_sessions add constraint workout_sessions_pkey PRIMARY KEY (id);
alter table public.workout_sessions add constraint workout_sessions_user_id_session_date_key UNIQUE (user_id, session_date);
alter table public.workout_sessions add constraint workout_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.workout_sessions add constraint workout_sessions_bodyweight_kg_check CHECK (((bodyweight_kg IS NULL) OR (bodyweight_kg > (0)::numeric)));
alter table public.workout_sessions add constraint workout_sessions_carb_day_type_check CHECK ((carb_day_type = ANY (ARRAY['high'::text, 'mid'::text, 'low'::text])));
alter table public.workout_sessions add constraint workout_sessions_recovery_check CHECK (((recovery IS NULL) OR ((recovery >= 1) AND (recovery <= 5))));

alter table public.body_logs enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.daily_plans enable row level security;
alter table public.food_import_cache enable row level security;
alter table public.food_overrides enable row level security;
alter table public.foods enable row level security;
alter table public.measurement_logs enable row level security;
alter table public.plan_day_overrides enable row level security;
alter table public.plan_instances enable row level security;
alter table public.planner_drafts enable row level security;
alter table public.planner_templates enable row level security;
alter table public.profiles enable row level security;
alter table public.training_logs enable row level security;
alter table public.workout_sessions enable row level security;

drop policy if exists "own body logs" on public.body_logs;
create policy "own body logs"
on public.body_logs for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "own daily checkins" on public.daily_checkins;
create policy "own daily checkins"
on public.daily_checkins for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "delete own plans" on public.daily_plans;
create policy "delete own plans"
on public.daily_plans for delete
using ((auth.uid() = user_id));
drop policy if exists "insert own plans" on public.daily_plans;
create policy "insert own plans"
on public.daily_plans for insert
with check ((auth.uid() = user_id));
drop policy if exists "own daily plans" on public.daily_plans;
create policy "own daily plans"
on public.daily_plans for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "read own plans" on public.daily_plans;
create policy "read own plans"
on public.daily_plans for select
using ((auth.uid() = user_id));
drop policy if exists "update own plans" on public.daily_plans;
create policy "update own plans"
on public.daily_plans for update
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "delete own food overrides" on public.food_overrides;
create policy "delete own food overrides"
on public.food_overrides for delete
using ((auth.uid() = user_id));
drop policy if exists "insert own food overrides" on public.food_overrides;
create policy "insert own food overrides"
on public.food_overrides for insert
with check ((auth.uid() = user_id));
drop policy if exists "read own food overrides" on public.food_overrides;
create policy "read own food overrides"
on public.food_overrides for select
using ((auth.uid() = user_id));
drop policy if exists "update own food overrides" on public.food_overrides;
create policy "update own food overrides"
on public.food_overrides for update
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "delete own foods" on public.foods;
create policy "delete own foods"
on public.foods for delete
using ((auth.uid() = user_id));
drop policy if exists "insert own foods" on public.foods;
create policy "insert own foods"
on public.foods for insert
with check ((auth.uid() = user_id));
drop policy if exists "read public and own foods" on public.foods;
create policy "read public and own foods"
on public.foods for select
using (((user_id IS NULL) OR (auth.uid() = user_id)));
drop policy if exists "update own foods" on public.foods;
create policy "update own foods"
on public.foods for update
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "own measurement logs" on public.measurement_logs;
create policy "own measurement logs"
on public.measurement_logs for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "own plan day overrides" on public.plan_day_overrides;
create policy "own plan day overrides"
on public.plan_day_overrides for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "own plan instances" on public.plan_instances;
create policy "own plan instances"
on public.plan_instances for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "own planner drafts" on public.planner_drafts;
create policy "own planner drafts"
on public.planner_drafts for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "own planner templates" on public.planner_templates;
create policy "own planner templates"
on public.planner_templates for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile"
on public.profiles for insert
with check ((auth.uid() = id));
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
on public.profiles for select
using ((auth.uid() = id));
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
on public.profiles for update
using ((auth.uid() = id))
with check ((auth.uid() = id));
drop policy if exists "own training logs" on public.training_logs;
create policy "own training logs"
on public.training_logs for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
drop policy if exists "delete own workout sessions" on public.workout_sessions;
create policy "delete own workout sessions"
on public.workout_sessions for delete
using ((auth.uid() = user_id));
drop policy if exists "insert own workout sessions" on public.workout_sessions;
create policy "insert own workout sessions"
on public.workout_sessions for insert
with check ((auth.uid() = user_id));
drop policy if exists "read own workout sessions" on public.workout_sessions;
create policy "read own workout sessions"
on public.workout_sessions for select
using ((auth.uid() = user_id));
drop policy if exists "update own workout sessions" on public.workout_sessions;
create policy "update own workout sessions"
on public.workout_sessions for update
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
