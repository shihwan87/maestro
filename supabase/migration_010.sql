-- Trusted devices — skip PIN entry for recognized browsers.
-- Device identity is a random UUID stored in localStorage; this table
-- maps tokens to user-assigned nicknames so the management UI can show
-- friendly names. No RLS — the PIN gate is the auth boundary, same as
-- the tasks side.

create table if not exists trusted_devices (
  id           uuid primary key default gen_random_uuid(),
  device_token text unique not null,
  nickname     text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
