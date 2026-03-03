-- Supabase Postgres schema for Tutor Intelligence Dashboard
-- Run this in Supabase SQL editor or via migration tooling.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create table if not exists teachers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  full_name text not null,
  current_grade integer not null,
  academic_year text not null,
  batch_name text,
  created_at timestamptz not null default now()
);

create table if not exists student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  content text not null,
  tag text,
  created_at timestamptz not null default now()
);

create table if not exists weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  week_start date not null,
  summary_text text not null,
  generated_at timestamptz not null default now(),
  unique (student_id, week_start)
);

create table if not exists monthly_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  month date not null,
  report_text text not null,
  generated_at timestamptz not null default now(),
  unique (student_id, month)
);

create table if not exists schedule_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  batch_or_student_label text not null
);

-- Indexes
create index if not exists idx_students_teacher_id on students(teacher_id);
create index if not exists idx_students_academic_year on students(academic_year);
create index if not exists idx_students_current_grade on students(current_grade);
create index if not exists idx_students_created_at on students(created_at);
create index if not exists idx_students_full_name_trgm on students using gin (full_name gin_trgm_ops);

create index if not exists idx_student_notes_student_id on student_notes(student_id);
create index if not exists idx_student_notes_teacher_id on student_notes(teacher_id);
create index if not exists idx_student_notes_created_at on student_notes(created_at);

create index if not exists idx_weekly_summaries_student_id on weekly_summaries(student_id);
create index if not exists idx_weekly_summaries_teacher_id on weekly_summaries(teacher_id);
create index if not exists idx_weekly_summaries_week_start on weekly_summaries(week_start);

create index if not exists idx_monthly_reports_student_id on monthly_reports(student_id);
create index if not exists idx_monthly_reports_teacher_id on monthly_reports(teacher_id);
create index if not exists idx_monthly_reports_month on monthly_reports(month);

create index if not exists idx_schedule_slots_teacher_id on schedule_slots(teacher_id);
create index if not exists idx_schedule_slots_day on schedule_slots(day_of_week);

-- Helper function for last note per student
create or replace function get_latest_notes(student_ids uuid[])
  returns table(student_id uuid, last_note_at timestamptz)
  language sql
  security invoker
as $$
  select n.student_id, max(n.created_at) as last_note_at
  from student_notes n
  where n.student_id = any(student_ids)
  group by n.student_id;
$$;

-- RLS
alter table teachers enable row level security;
alter table students enable row level security;
alter table student_notes enable row level security;
alter table weekly_summaries enable row level security;
alter table monthly_reports enable row level security;
alter table schedule_slots enable row level security;

-- Teachers policies
create policy "teachers_select_own" on teachers
  for select using (id = auth.uid());

create policy "teachers_insert_own" on teachers
  for insert with check (id = auth.uid());

create policy "teachers_update_own" on teachers
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Students policies
create policy "students_select_own" on students
  for select using (teacher_id = auth.uid());

create policy "students_insert_own" on students
  for insert with check (teacher_id = auth.uid());

create policy "students_update_own" on students
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "students_delete_own" on students
  for delete using (teacher_id = auth.uid());

-- Student notes policies
create policy "student_notes_select_own" on student_notes
  for select using (teacher_id = auth.uid());

create policy "student_notes_insert_own" on student_notes
  for insert with check (teacher_id = auth.uid());

create policy "student_notes_update_own" on student_notes
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "student_notes_delete_own" on student_notes
  for delete using (teacher_id = auth.uid());

-- Weekly summaries policies
create policy "weekly_summaries_select_own" on weekly_summaries
  for select using (teacher_id = auth.uid());

create policy "weekly_summaries_insert_own" on weekly_summaries
  for insert with check (teacher_id = auth.uid());

create policy "weekly_summaries_update_own" on weekly_summaries
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "weekly_summaries_delete_own" on weekly_summaries
  for delete using (teacher_id = auth.uid());

-- Monthly reports policies
create policy "monthly_reports_select_own" on monthly_reports
  for select using (teacher_id = auth.uid());

create policy "monthly_reports_insert_own" on monthly_reports
  for insert with check (teacher_id = auth.uid());

create policy "monthly_reports_update_own" on monthly_reports
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "monthly_reports_delete_own" on monthly_reports
  for delete using (teacher_id = auth.uid());

-- Schedule slots policies
create policy "schedule_slots_select_own" on schedule_slots
  for select using (teacher_id = auth.uid());

create policy "schedule_slots_insert_own" on schedule_slots
  for insert with check (teacher_id = auth.uid());

create policy "schedule_slots_update_own" on schedule_slots
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "schedule_slots_delete_own" on schedule_slots
  for delete using (teacher_id = auth.uid());
