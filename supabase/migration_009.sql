-- Phase 10 — auto-inbox workflow.
-- Adds proposal/tier/commit_sha/error columns and two new statuses
-- ('proposed' = awaiting user approval, 'executing' = agent picked up
-- approved row and is running). See CLAUDE.md > "Auto-inbox workflow".

alter table claude_requests
  add column if not exists proposal   text,
  add column if not exists tier       text check (tier in ('trivial','ambiguous','non_trivial')),
  add column if not exists commit_sha text,
  add column if not exists error      text,
  add column if not exists run_id     text;

-- Drop and recreate the status check to allow the two new states.
alter table claude_requests drop constraint if exists claude_requests_status_check;
alter table claude_requests
  add constraint claude_requests_status_check
  check (status in ('open','proposed','executing','done','dismissed','failed'));

-- Timestamps so the UI can show "proposed 2h ago" style hints.
alter table claude_requests
  add column if not exists proposed_at   timestamptz,
  add column if not exists approved_at   timestamptz,
  add column if not exists completed_at  timestamptz;

create index if not exists claude_requests_tier_idx on claude_requests (tier);
