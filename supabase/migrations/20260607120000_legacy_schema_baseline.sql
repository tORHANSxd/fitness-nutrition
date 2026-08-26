-- These four tables predate the remote migration history. Keep this baseline
-- idempotent so existing projects can record it with --include-all safely.
create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  profile jsonb not null,
  meals jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists public.food_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  base_food_id text not null,
  name text not null,
  category text not null check (category in ('主食', '蔬菜', '水果', '肉类', '补剂', '坚果')),
  kcal_per_100g numeric(8, 2) not null check (kcal_per_100g >= 0),
  fat_per_100g numeric(8, 2) not null check (fat_per_100g >= 0),
  carbs_per_100g numeric(8, 2) not null check (carbs_per_100g >= 0),
  protein_per_100g numeric(8, 2) not null check (protein_per_100g >= 0),
  weight_basis text not null check (weight_basis in ('raw', 'cooked')),
  cooked_raw_ratio numeric(8, 3) check (cooked_raw_ratio is null or cooked_raw_ratio > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, base_food_id)
);

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('主食', '蔬菜', '水果', '肉类', '补剂', '坚果')),
  kcal_per_100g numeric(8, 2) not null check (kcal_per_100g >= 0),
  fat_per_100g numeric(8, 2) not null check (fat_per_100g >= 0),
  carbs_per_100g numeric(8, 2) not null check (carbs_per_100g >= 0),
  protein_per_100g numeric(8, 2) not null check (protein_per_100g >= 0),
  weight_basis text not null check (weight_basis in ('raw', 'cooked')),
  cooked_raw_ratio numeric(8, 3) check (cooked_raw_ratio is null or cooked_raw_ratio > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  split_label text not null,
  bodyweight_kg numeric(6, 2) check (bodyweight_kg is null or bodyweight_kg > 0),
  recovery smallint check (recovery is null or recovery between 1 and 5),
  note text,
  sets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_date)
);
