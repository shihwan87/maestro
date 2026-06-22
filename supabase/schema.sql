-- Schemanager schema. Run once in Supabase SQL Editor.
-- RLS intentionally OFF for MVP (single user behind PIN).

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text check (category in ('ICU/Clinical','Research','Education')),
  deadline date,
  status text default 'Not Started' check (status in ('Not Started','In Progress','Done')),
  created_at timestamptz default now()
);

create table if not exists steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text,
  status text default 'Not Started' check (status in ('Not Started','In Progress','Done')),
  notes text,
  sort_order int default 0,
  gcal_event_id text
);

create table if not exists subtasks (
  id uuid primary key default gen_random_uuid(),
  step_id uuid references steps(id) on delete cascade,
  text text,
  done boolean default false,
  sort_order int default 0
);

create index if not exists steps_project_idx on steps (project_id);
create index if not exists subtasks_step_idx on subtasks (step_id);
create index if not exists projects_deadline_idx on projects (deadline);
