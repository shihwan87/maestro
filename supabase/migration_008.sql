-- Phase 1 (schedule_manager) — sched_* tables + RLS.
-- Backs the schedule_manager companion app (interface_contract.md module 1).
-- Unlike schemanager's own MVP tables (RLS off, single PIN), this app has
-- real Supabase Auth users, so every sched_* table is per-user RLS-scoped.
-- Does not touch projects/steps/subtasks/categories — those stay owned by
-- schemanager and are only read (never migrated) by this app.

create table if not exists sched_google_auth (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz default now()
);

-- Main events table. sched_events is the app's own canonical calendar
-- (Design Lock #14) — google_event_id/calendar_id are NULL for the common
-- case of a local-only event, and only populated once an event is pushed
-- to or imported from Google.
create table if not exists sched_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_event_id text,             -- NULL = local-only (default)
  calendar_id text,                 -- NULL until pushed/imported
  category text check (category in ('work','personal','holiday')),
  source text check (source in ('app','imported','holiday')),
  title text not null,
  description text,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  all_day boolean default false,
  rrule text,                       -- RFC 5545 recurrence rule
  recurrence_parent_id uuid references sched_events(id),
  override_of_event_id uuid references sched_events(id),
  override_start_ts timestamptz,    -- original slot this override replaces
  task_id uuid,                     -- references schemanager's steps.id (no FK: separate concern, task planner has no "tasks" table)
  last_synced_title text,           -- last known-good title shared with linked step (idempotency guard, J10)
  last_synced_date date,            -- last known-good date shared with linked step, date-only (idempotency guard, J10)
  color_override text,              -- local-display-only hex/token; NEVER synced to Google colorId
  extended_props jsonb,
  synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, google_event_id, calendar_id)
);

-- Per-calendar incremental sync state
create table if not exists sched_sync_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  sync_token text,
  last_polled_at timestamptz,
  primary key (user_id, calendar_id)
);

-- Sync run log
create table if not exists sched_sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  calendar_id text,
  ran_at timestamptz default now(),
  events_added int default 0,
  events_updated int default 0,
  events_deleted int default 0,
  error text
);

-- Weekly report metadata
create table if not exists sched_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  iso_week text,                    -- e.g. '2026-W27'
  generated_at timestamptz default now(),
  pdf_local_path text,
  drive_file_id text,
  summary_json jsonb
);

create index if not exists sched_events_user_start_idx on sched_events (user_id, start_ts);
create index if not exists sched_events_user_task_idx on sched_events (user_id, task_id);
create index if not exists sched_events_user_recurrence_idx on sched_events (user_id, recurrence_parent_id);

-- Row-Level Security: every sched_* row is scoped to auth.uid().
alter table sched_google_auth enable row level security;
alter table sched_events enable row level security;
alter table sched_sync_state enable row level security;
alter table sched_sync_log enable row level security;
alter table sched_reports enable row level security;

create policy sched_google_auth_owner on sched_google_auth
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy sched_events_owner on sched_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy sched_sync_state_owner on sched_sync_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy sched_sync_log_owner on sched_sync_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy sched_reports_owner on sched_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
