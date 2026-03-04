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

create or replace function public.recalc_student_last_note_at(student_uuid uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  update students
    set last_note_at = (
      select max(created_at)
      from student_notes
      where student_id = student_uuid
    )
    where id = student_uuid;
end;
$$;

create or replace function public.handle_student_note_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update students
      set last_note_at = new.created_at
      where id = new.student_id
        and (last_note_at is null or last_note_at < new.created_at);
    return new;
  end if;

  if (tg_op = 'DELETE') then
    perform public.recalc_student_last_note_at(old.student_id);
    return old;
  end if;

  if (tg_op = 'UPDATE') then
    if (old.student_id is distinct from new.student_id) then
      perform public.recalc_student_last_note_at(old.student_id);
    end if;
    perform public.recalc_student_last_note_at(new.student_id);
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists on_student_note_insert on student_notes;
drop trigger if exists on_student_note_update on student_notes;
drop trigger if exists on_student_note_delete on student_notes;
drop function if exists public.touch_student_last_note_at();

create trigger on_student_note_insert
  after insert on student_notes
  for each row execute function public.handle_student_note_change();

create trigger on_student_note_update
  after update of created_at, student_id on student_notes
  for each row execute function public.handle_student_note_change();

create trigger on_student_note_delete
  after delete on student_notes
  for each row execute function public.handle_student_note_change();

create index concurrently if not exists idx_students_last_note_at on students(last_note_at);
