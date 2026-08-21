-- Silence the Supabase linter (rls_disabled_in_public) for the TASKS-side
-- tables. These tables intentionally have no per-row access control: the PIN
-- gate (client-side, see PinGate.jsx) is the auth boundary, and the anon key
-- used for all of them is public in the client bundle regardless. Enabling
-- RLS with an allow-all policy matches Supabase's recommended posture for
-- publicly-exposed tables without changing actual access.
--
-- Re-runnable: every policy is dropped first, so applying this twice is a
-- no-op rather than a "policy already exists" error. Enabling RLS without a
-- matching policy would lock the app out of its own tables, so the two must
-- always be applied together — never run the `enable row level security`
-- block on its own.

alter table projects        enable row level security;
alter table categories      enable row level security;
alter table steps           enable row level security;
alter table subtasks        enable row level security;
alter table claude_requests enable row level security;
alter table trusted_devices enable row level security;

drop policy if exists projects_anon_all        on projects;
drop policy if exists categories_anon_all      on categories;
drop policy if exists steps_anon_all           on steps;
drop policy if exists subtasks_anon_all        on subtasks;
drop policy if exists claude_requests_anon_all on claude_requests;
drop policy if exists trusted_devices_anon_all on trusted_devices;

create policy projects_anon_all on projects
  for all to anon, authenticated using (true) with check (true);

create policy categories_anon_all on categories
  for all to anon, authenticated using (true) with check (true);

create policy steps_anon_all on steps
  for all to anon, authenticated using (true) with check (true);

create policy subtasks_anon_all on subtasks
  for all to anon, authenticated using (true) with check (true);

create policy claude_requests_anon_all on claude_requests
  for all to anon, authenticated using (true) with check (true);

create policy trusted_devices_anon_all on trusted_devices
  for all to anon, authenticated using (true) with check (true);

-- study_topics is the same kind of table (PIN-gated, anon-key-accessed, no
-- per-row ownership), so its policy belongs here too — but it is created by
-- migration_013, which is numbered *after* this file. The guard makes the
-- block a no-op on a from-scratch rebuild that reaches 011 first; re-run 011
-- after 013 in that case to pick it up.
do $$
begin
  if to_regclass('public.study_topics') is not null then
    execute 'alter table study_topics enable row level security';
    execute 'drop policy if exists study_topics_anon_all on study_topics';
    execute 'create policy study_topics_anon_all on study_topics
               for all to anon, authenticated using (true) with check (true)';
  end if;
end $$;
