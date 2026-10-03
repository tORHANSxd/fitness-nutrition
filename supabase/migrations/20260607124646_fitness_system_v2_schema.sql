create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  sex text check (sex in ('male', 'female')),
  birth_year int,
  height_cm numeric(6, 2),
  starting_weight_kg numeric(6, 2),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.foods add column if not exists external_id text;
alter table public.foods add column if not exists brand text;
alter table public.foods add column if not exists serving_description text;
alter table public.foods add column if not exists source text not null default 'user';

create table if not exists public.plan_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  use_platform_stage boolean not null default true,
  active boolean not null default true,
  custom_targets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists plan_instances_one_active_per_user
on public.plan_instances (user_id)
where active = true;

create table if not exists public.plan_day_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_date date not null,
  plan_day_number int not null check (plan_day_number between 1 and 84),
  created_at timestamptz not null default now(),
  unique (user_id, calendar_date)
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  actual jsonb not null,
  vegetable_grams numeric(7, 2) not null default 0,
  water_liters numeric(5, 2) not null default 0,
  steps int not null default 0,
  post_workout_carbs numeric(7, 2) not null default 0,
  post_workout_protein numeric(7, 2) not null default 0,
  sleep_hours numeric(4, 2) not null default 0,
  hunger_level int check (hunger_level is null or hunger_level between 1 and 5),
  mood_level int check (mood_level is null or mood_level between 1 and 5),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists public.body_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  weight_kg numeric(6, 2),
  waist_cm numeric(6, 2),
  chest_cm numeric(6, 2),
  hip_cm numeric(6, 2),
  shoulder_cm numeric(6, 2),
  upper_arm_cm numeric(6, 2),
  thigh_cm numeric(6, 2),
  calf_cm numeric(6, 2),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists public.measurement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  avg_weight_kg numeric(6, 2),
  waist_cm numeric(6, 2),
  chest_cm numeric(6, 2),
  hip_cm numeric(6, 2),
  shoulder_cm numeric(6, 2),
  upper_arm_cm numeric(6, 2),
  thigh_cm numeric(6, 2),
  calf_cm numeric(6, 2),
  photo_urls text[] not null default '{}',
  main_lifts jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.training_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  movement text not null,
  load_kg numeric(7, 2),
  sets int,
  reps int,
  rpe numeric(4, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_type text not null check (template_type in ('meal', 'day')),
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_import_cache (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  query text not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, query)
);

create index if not exists daily_checkins_user_date_idx on public.daily_checkins (user_id, plan_date);
create index if not exists body_logs_user_date_idx on public.body_logs (user_id, plan_date);
create index if not exists training_logs_user_date_idx on public.training_logs (user_id, plan_date);
create index if not exists food_import_cache_expiry_idx on public.food_import_cache (provider, query, expires_at);

alter table public.profiles enable row level security;
alter table public.foods enable row level security;
alter table public.food_overrides enable row level security;
alter table public.plan_instances enable row level security;
alter table public.plan_day_overrides enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.body_logs enable row level security;
alter table public.measurement_logs enable row level security;
alter table public.training_logs enable row level security;
alter table public.daily_plans enable row level security;
alter table public.planner_templates enable row level security;
alter table public.food_import_cache enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "read public and own foods" on public.foods;
create policy "read public and own foods" on public.foods for select using (user_id is null or auth.uid() = user_id);
drop policy if exists "insert own foods" on public.foods;
create policy "insert own foods" on public.foods for insert with check (auth.uid() = user_id);
drop policy if exists "update own foods" on public.foods;
create policy "update own foods" on public.foods for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own foods" on public.foods;
create policy "delete own foods" on public.foods for delete using (auth.uid() = user_id);

drop policy if exists "read own food overrides" on public.food_overrides;
create policy "read own food overrides" on public.food_overrides for select using (auth.uid() = user_id);
drop policy if exists "insert own food overrides" on public.food_overrides;
create policy "insert own food overrides" on public.food_overrides for insert with check (auth.uid() = user_id);
drop policy if exists "update own food overrides" on public.food_overrides;
create policy "update own food overrides" on public.food_overrides for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own food overrides" on public.food_overrides;
create policy "delete own food overrides" on public.food_overrides for delete using (auth.uid() = user_id);

drop policy if exists "own plan instances" on public.plan_instances;
create policy "own plan instances" on public.plan_instances for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own plan day overrides" on public.plan_day_overrides;
create policy "own plan day overrides" on public.plan_day_overrides for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own daily checkins" on public.daily_checkins;
create policy "own daily checkins" on public.daily_checkins for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own body logs" on public.body_logs;
create policy "own body logs" on public.body_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own measurement logs" on public.measurement_logs;
create policy "own measurement logs" on public.measurement_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own training logs" on public.training_logs;
create policy "own training logs" on public.training_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own daily plans" on public.daily_plans;
create policy "own daily plans" on public.daily_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own planner templates" on public.planner_templates;
create policy "own planner templates" on public.planner_templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
