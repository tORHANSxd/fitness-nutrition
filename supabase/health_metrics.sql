-- Apple 健康 / Apple Watch 每日身体数据接入表。
-- 需在 Supabase SQL Editor 手动执行一次（本项目无自动 DDL 权限）。
-- 写入由 /api/health-sync 路由用 service-role 完成（校验令牌后代写）；
-- App 端登录后按 RLS 只读/改自己的行。同步令牌存在 profiles.preferences.healthSyncToken（无需额外列）。

create extension if not exists "pgcrypto";

create table if not exists public.health_metrics (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  metric_date date not null,
  weight_kg numeric(6,2),
  body_fat_pct numeric(5,2),
  active_energy_kcal numeric(7,1),   -- 活动能量（喂 TDEE 的运动消耗）
  resting_energy_kcal numeric(7,1),  -- 静息能量（可对照 BMR）
  resting_hr numeric(5,1),           -- 静息心率
  hrv_ms numeric(6,1),               -- 心率变异性 SDNN
  vo2max numeric(5,1),               -- 最大摄氧量
  sleep_hours numeric(4,2),          -- 睡眠时长
  steps integer,
  exercise_minutes numeric(6,1),
  source text not null default 'apple_health',
  raw jsonb,                         -- 原始载荷留档，便于日后扩展新指标
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.health_metrics add constraint health_metrics_pkey primary key (id);
alter table public.health_metrics add constraint health_metrics_user_id_metric_date_key unique (user_id, metric_date);
alter table public.health_metrics add constraint health_metrics_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
create index if not exists health_metrics_user_date_idx on public.health_metrics (user_id, metric_date desc);

alter table public.health_metrics enable row level security;
drop policy if exists "own health metrics" on public.health_metrics;
create policy "own health metrics"
on public.health_metrics for all
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
