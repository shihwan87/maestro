-- Phase 10 — Study tab: hierarchical topic/subtopic tree, independent of
-- WORK/PERSONAL scope. Unlimited depth via self-referencing parent_id.
-- RLS off, consistent with the rest of the TASKS-side tables.

create table if not exists study_topics (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references study_topics(id) on delete cascade,
  title text not null,
  notes text default '',
  sort_order int default 0,
  created_at timestamptz default now()
);

create index if not exists study_topics_parent_idx on study_topics (parent_id);

-- One-time data migration: move every project in the WORK-scope 'Study'
-- category into the new tree (project -> root topic, its steps -> child
-- topics), then remove the now-redundant source rows and category.
do $$
declare
  proj record;
  step record;
  new_topic_id uuid;
  root_order int := 0;
begin
  for proj in
    select * from projects where scope = 'work' and category = 'Study' order by created_at
  loop
    insert into study_topics (title, sort_order)
      values (proj.title, root_order)
      returning id into new_topic_id;
    root_order := root_order + 1;

    for step in
      select * from steps where project_id = proj.id order by sort_order
    loop
      insert into study_topics (parent_id, title, notes, sort_order)
        values (new_topic_id, step.title, coalesce(step.notes, ''), step.sort_order);
    end loop;
  end loop;

  delete from projects where scope = 'work' and category = 'Study';
  delete from categories where scope = 'work' and name = 'Study';
end $$;
