create extension if not exists "pgcrypto";

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
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

alter table public.foods enable row level security;
alter table public.daily_plans enable row level security;
alter table public.food_overrides enable row level security;

drop policy if exists "read public and own foods" on public.foods;
create policy "read public and own foods"
on public.foods for select
using (user_id is null or auth.uid() = user_id);

drop policy if exists "insert own foods" on public.foods;
create policy "insert own foods"
on public.foods for insert
with check (auth.uid() = user_id);

drop policy if exists "update own foods" on public.foods;
create policy "update own foods"
on public.foods for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "delete own foods" on public.foods;
create policy "delete own foods"
on public.foods for delete
using (auth.uid() = user_id);

drop policy if exists "read own food overrides" on public.food_overrides;
create policy "read own food overrides"
on public.food_overrides for select
using (auth.uid() = user_id);

drop policy if exists "insert own food overrides" on public.food_overrides;
create policy "insert own food overrides"
on public.food_overrides for insert
with check (auth.uid() = user_id);

drop policy if exists "update own food overrides" on public.food_overrides;
create policy "update own food overrides"
on public.food_overrides for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "delete own food overrides" on public.food_overrides;
create policy "delete own food overrides"
on public.food_overrides for delete
using (auth.uid() = user_id);

drop policy if exists "read own plans" on public.daily_plans;
create policy "read own plans"
on public.daily_plans for select
using (auth.uid() = user_id);

drop policy if exists "insert own plans" on public.daily_plans;
create policy "insert own plans"
on public.daily_plans for insert
with check (auth.uid() = user_id);

drop policy if exists "update own plans" on public.daily_plans;
create policy "update own plans"
on public.daily_plans for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "delete own plans" on public.daily_plans;
create policy "delete own plans"
on public.daily_plans for delete
using (auth.uid() = user_id);
