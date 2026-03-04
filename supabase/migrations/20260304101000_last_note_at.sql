alter table students
  add column if not exists last_note_at timestamptz;

update students s
set last_note_at = latest.last_note_at
from (
  select student_id, max(created_at) as last_note_at
  from student_notes
  group by student_id
) latest
where s.id = latest.student_id
  and (s.last_note_at is null or s.last_note_at < latest.last_note_at);

create or replace function public.touch_student_last_note_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  update students
    set last_note_at = new.created_at
    where id = new.student_id
      and (last_note_at is null or last_note_at < new.created_at);
  return new;
end;
$$;

drop trigger if exists on_student_note_insert on student_notes;
create trigger on_student_note_insert
  after insert on student_notes
  for each row execute function public.touch_student_last_note_at();

create index if not exists idx_students_last_note_at on students(last_note_at);
