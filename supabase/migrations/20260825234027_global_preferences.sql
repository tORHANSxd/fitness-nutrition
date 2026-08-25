alter table public.profiles
  add column if not exists locale text,
  add column if not exists time_zone text,
  add column if not exists time_zone_mode text not null default 'auto',
  add column if not exists week_starts_on smallint not null default 1,
  add column if not exists unit_system text not null default 'metric',
  add column if not exists energy_unit text not null default 'kcal',
  add column if not exists hour_cycle text not null default 'h23',
  add column if not exists theme text not null default 'system',
  add column if not exists reduce_motion boolean;

update public.profiles
set
  locale = coalesce(locale, 'zh-CN'),
  time_zone = coalesce(time_zone, 'Asia/Shanghai');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_locale_check') then
    alter table public.profiles add constraint profiles_locale_check check (locale is null or locale in ('zh-CN', 'en'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_time_zone_mode_check') then
    alter table public.profiles add constraint profiles_time_zone_mode_check check (time_zone_mode in ('auto', 'fixed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_week_starts_on_check') then
    alter table public.profiles add constraint profiles_week_starts_on_check check (week_starts_on between 0 and 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_unit_system_check') then
    alter table public.profiles add constraint profiles_unit_system_check check (unit_system in ('metric', 'imperial'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_energy_unit_check') then
    alter table public.profiles add constraint profiles_energy_unit_check check (energy_unit in ('kcal', 'kj'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_hour_cycle_check') then
    alter table public.profiles add constraint profiles_hour_cycle_check check (hour_cycle in ('h12', 'h23'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_theme_check') then
    alter table public.profiles add constraint profiles_theme_check check (theme in ('system', 'light', 'dark'));
  end if;
end
$$;

comment on column public.profiles.locale is 'UI locale; null until first-login device detection completes.';
comment on column public.profiles.time_zone is 'IANA time zone used when time_zone_mode is fixed; last detected zone in auto mode.';
comment on column public.profiles.reduce_motion is 'Null follows the operating-system preference; true/false is an explicit override.';
