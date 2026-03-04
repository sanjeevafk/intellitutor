DROP POLICY IF EXISTS "student_notes_insert_own" ON student_notes;
CREATE POLICY "student_notes_insert_own" ON student_notes
  FOR INSERT WITH CHECK (
    teacher_id = auth.uid()
    AND student_id IN (SELECT id FROM students WHERE teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS "student_notes_update_own" ON student_notes;
CREATE POLICY "student_notes_update_own" ON student_notes
  FOR UPDATE USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND student_id IN (SELECT id FROM students WHERE teacher_id = auth.uid())
  );
