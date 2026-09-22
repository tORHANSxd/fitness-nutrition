-- Cover the referencing columns of the three v4 ownership foreign keys.
-- Existing unique indexes cover the referenced keys, not these child lookups.
-- The production tables were each <= 64 KiB at review. Fail quickly on contention.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create index user_plan_protocols_user_supersedes_idx
  on public.user_plan_protocols (user_id, supersedes_id);
create index workout_schedules_user_protocol_idx
  on public.workout_schedules (user_id, protocol_id);
create index workout_sessions_user_schedule_idx
  on public.workout_sessions (user_id, schedule_id);

commit;
