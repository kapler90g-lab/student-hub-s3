-- Run this whole file in Supabase Dashboard -> SQL Editor.
-- The backend uses the service-role key, which bypasses RLS. Never expose that
-- key in the browser. RLS is enabled to prevent accidental public API access.

create extension if not exists pgcrypto;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  emoji text not null default '📚',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 1 and 10000),
  priority text not null default 'normal'
    check (priority in ('urgent', 'important', 'normal')),
  pinned boolean not null default false,
  subject_id uuid references public.subjects(id) on delete set null,
  deadline_at timestamptz,
  expires_at timestamptz,
  created_by bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '',
  subject_id uuid not null references public.subjects(id) on delete restrict,
  material_type text not null default 'notes'
    check (material_type in ('notes','slides','assignment','past_paper','reading','other')),
  priority text not null default 'normal'
    check (priority in ('important','normal')),
  file_path text not null,
  file_name text not null,
  file_size bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  created_by bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_feed_idx
  on public.announcements (pinned desc, created_at desc);
create index if not exists resources_subject_idx
  on public.resources (subject_id, created_at desc);

alter table public.subjects enable row level security;
alter table public.announcements enable row level security;
alter table public.resources enable row level security;

-- Private bucket. Files are served with short-lived signed URLs created by backend.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-files',
  'student-files',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = excluded.allowed_mime_types;

-- Intentionally no anonymous policies. Do not put the service-role key in frontend code.
