-- Daily notes: one row per (user_id, note_date). Two free-text boxes —
-- events_text (pre-filled client-side from that day's sched_events on first
-- open, then left alone) and thoughts_text (always freeform). Same
-- per-user RLS shape as the other sched_* tables from migration_008.

create table if not exists sched_daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_date date not null,
  events_text text default '',
  thoughts_text text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, note_date)
);

alter table sched_daily_notes enable row level security;

create policy sched_daily_notes_owner on sched_daily_notes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
