-- Run once in Supabase SQL Editor to enable the timetable feature.
create table if not exists public.class_timetable (
  id text primary key default 'class' check (id = 'class'),
  periods jsonb not null default '[]'::jsonb,
  updated_by bigint,
  updated_at timestamptz not null default now()
);
alter table public.class_timetable enable row level security;
-- Backend accesses this table with the server-only Supabase service-role key.
insert into public.class_timetable (id, periods)
values ('class', '[{"label":"PERIOD 1","time":"2:00–2:50","lessons":["Critical Thinking","Physical Fitness","English (1)","","Psychology"]},{"label":"PERIOD 2","time":"3:00–3:50","lessons":["Critical Thinking","Physical Fitness","English (1)","","Psychology"]},{"label":"PERIOD 3","time":"4:00–4:50","lessons":["English (2)","Physics","English (2)","",""]},{"label":"PERIOD 4","time":"5:00–5:50","lessons":["English (2)","Physics","","",""]},{"label":"PERIOD 5","time":"7:30–8:20","lessons":["General Physics","Mathematics","Mathematics","Geography",""]},{"label":"PERIOD 6","time":"8:30–9:20","lessons":["Psychology (every 2 weeks)","Mathematics","Critical Thinking (teacher won''t come)","Geography",""]},{"label":"PERIOD 7","time":"9:30–10:20","lessons":["History","English (1)","Geography","",""]},{"label":"PERIOD 8","time":"10:30–11:20","lessons":["History","","","",""]}]'::jsonb)
on conflict (id) do nothing;
