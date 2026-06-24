-- 分餐草稿表：每用户一行，存当前未提交的 profile + meals 自动保存草稿。
-- 在 Supabase 控制台 → SQL Editor 直接整段运行即可（anon key 无法建表/改 RLS）。
create table if not exists public.planner_drafts (
  user_id uuid not null,
  profile jsonb not null,
  meals jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_drafts_pkey primary key (user_id),
  constraint planner_drafts_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

alter table public.planner_drafts enable row level security;

drop policy if exists "own planner drafts" on public.planner_drafts;
create policy "own planner drafts"
on public.planner_drafts for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
