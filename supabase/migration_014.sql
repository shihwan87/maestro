-- Lets the user write back to a proposal from the CONFIG tab instead of
-- only being able to Approve or Reject it. `user_note` holds that free text;
-- `user_note_at` timestamps it so the agent can tell a fresh reply from one
-- it already acted on.
--
-- Deliberately a separate column from `response` (agent → user) and
-- `proposal` (agent → user): keeping the three directions apart means a
-- reply can never overwrite the proposal it is answering.
--
-- 'revising' is the status a replied-to row lands in: no longer awaiting a
-- plain yes/no, not yet approved to run. The agent picks these up, reads
-- user_note, and either re-proposes (back to 'proposed') or ships.

alter table claude_requests
  add column if not exists user_note    text,
  add column if not exists user_note_at timestamptz;

alter table claude_requests drop constraint if exists claude_requests_status_check;
alter table claude_requests
  add constraint claude_requests_status_check
  check (status in ('open','proposed','revising','executing','done','dismissed','failed'));
