-- Run this migration once in Supabase SQL Editor for an existing Student Hub deployment.
-- The server uses the service-role key; no client-side access policies are added.
create table if not exists public.student_roster (
  telegram_id text primary key,
  full_name text,
  telegram_first_name text,
  username text,
  expected boolean not null default false,
  registered_at timestamptz,
  last_seen_at timestamptz,
  added_by bigint,
  created_at timestamptz not null default now(),
  constraint student_roster_telegram_id_digits check (telegram_id ~ '^[0-9]{5,20}$')
);

create index if not exists student_roster_expected_idx
  on public.student_roster (expected, full_name);
create index if not exists student_roster_last_seen_idx
  on public.student_roster (last_seen_at desc);

alter table public.student_roster enable row level security;
