-- Migration 002: dynamic categories, step deadlines, Uncategorized fallback.

-- 1. categories table
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null,
  is_default boolean default false,
  created_at timestamptz default now()
);

-- 2. seed the three originals + Uncategorized fallback
insert into categories (name, color, is_default) values
  ('ICU/Clinical', '#4a9eff', true),
  ('Research',     '#4ecf7a', true),
  ('Education',    '#c47aff', true),
  ('Uncategorized','#8a8fa3', true)
on conflict (name) do nothing;

-- 3. relax the projects.category CHECK so any text is allowed
alter table projects drop constraint if exists projects_category_check;

-- 4. add deadline to steps
alter table steps add column if not exists deadline date;

-- 5. helper: when a category is deleted, projects fall back to 'Uncategorized'
create or replace function reassign_to_uncategorized()
returns trigger language plpgsql as $$
begin
  update projects set category = 'Uncategorized' where category = old.name;
  return old;
end $$;

drop trigger if exists trg_category_delete on categories;
create trigger trg_category_delete
  before delete on categories
  for each row execute function reassign_to_uncategorized();
