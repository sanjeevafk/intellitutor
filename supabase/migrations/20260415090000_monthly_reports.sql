create extension if not exists "pgcrypto";

create table if not exists monthly_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  month_start date not null,
  overview text not null,
  strengths text not null,
  areas_to_monitor text not null,
  generated_at timestamptz not null default now()
);

create unique index if not exists monthly_reports_student_month_unique
  on monthly_reports(student_id, month_start);

create index if not exists monthly_reports_teacher_id_idx
  on monthly_reports(teacher_id);

create index if not exists monthly_reports_student_id_idx
  on monthly_reports(student_id);

create index if not exists monthly_reports_month_start_idx
  on monthly_reports(month_start);

alter table monthly_reports enable row level security;

drop policy if exists "monthly_reports_select_own" on monthly_reports;
create policy "monthly_reports_select_own" on monthly_reports
  for select using (teacher_id = auth.uid());

drop policy if exists "monthly_reports_insert_own" on monthly_reports;
create policy "monthly_reports_insert_own" on monthly_reports
  for insert with check (
    teacher_id = auth.uid()
    and student_id in (select id from students where teacher_id = auth.uid())
  );

drop policy if exists "monthly_reports_update_own" on monthly_reports;
create policy "monthly_reports_update_own" on monthly_reports
  for update using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and student_id in (select id from students where teacher_id = auth.uid())
  );

drop policy if exists "monthly_reports_delete_own" on monthly_reports;
create policy "monthly_reports_delete_own" on monthly_reports
  for delete using (teacher_id = auth.uid());
