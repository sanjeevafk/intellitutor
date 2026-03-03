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
