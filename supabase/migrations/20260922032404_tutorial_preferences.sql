-- User-scoped tutorial preferences inherit the existing profiles ownership RLS.
alter table public.profiles
  add column tutorial_seen_version integer not null default 0 check (tutorial_seen_version >= 0),
  add column tutorial_every_visit boolean not null default false;
comment on column public.profiles.tutorial_seen_version is 'Latest tutorial version completed or explicitly dismissed by this user.';
comment on column public.profiles.tutorial_every_visit is 'Show the interactive tutorial on each new app visit; useful for test accounts.';
