import { NextResponse } from "next/server";
import { ApiError } from "../../../../_lib/api-error";
import { requireAuth } from "../../../../_lib/auth";
import { withRoute } from "../../../../_lib/with-route";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

type NoteInput = {
  content?: string;
  tag?: string | null;
};

export const GET = withRoute(async ({ request, params, requestId }) => {
  const { userId } = await requireAuth(request);
  const studentId = getStudentId(params, request);
  if (!studentId) {
    throw new ApiError(400, "missing student_id");
  }

  const db = getDb();
  try {
    const { rows } = await db.execute({
      sql: `SELECT id, student_id, teacher_id, content, tag, created_at 
            FROM student_notes 
            WHERE student_id = ? AND teacher_id = ? 
            ORDER BY created_at DESC`,
      args: [studentId, userId]
    });

    const notes = rows.map((row) => ({
      id: row.id,
      student_id: row.student_id,
      teacher_id: row.teacher_id,
      content: row.content,
      tag: row.tag,
      created_at: row.created_at
    }));

    const response = NextResponse.json(notes, { status: 200 });
    response.headers.set("x-user-id", userId);
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (err) {
    throw new ApiError(500, "failed to fetch notes", err);
  }
});

export const POST = withRoute(async ({ request, params, requestId }) => {
  const { userId } = await requireAuth(request);
  const studentId = getStudentId(params, request);
  if (!studentId) {
    throw new ApiError(400, "missing student_id");
  }

  let body: NoteInput;
  try {
    body = (await request.json()) as NoteInput;
  } catch {
    throw new ApiError(400, "invalid JSON payload");
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const tag = typeof body.tag === "string" ? body.tag.trim() || null : null;

  if (!content) {
    throw new ApiError(400, "content is required");
  }

  const db = getDb();
  try {
    // 1. Verify student exists and belongs to the teacher
    const studentCheck = await db.execute({
      sql: "SELECT id FROM students WHERE id = ? AND teacher_id = ?",
      args: [studentId, userId]
    });

    if (studentCheck.rows.length === 0) {
      throw new ApiError(404, "student not found");
    }

    const noteId = randomUUID();
    const createdAt = new Date().toISOString();

    // 2. Perform the insert and programmatic trigger update in a transaction-like batch
    await db.batch([
      {
        sql: `INSERT INTO student_notes (id, student_id, teacher_id, content, tag, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [noteId, studentId, userId, content, tag, createdAt]
      },
      {
        sql: "UPDATE students SET last_note_at = ? WHERE id = ? AND teacher_id = ?",
        args: [createdAt, studentId, userId]
      }
    ]);

    const response = NextResponse.json({
      id: noteId,
      student_id: studentId,
      teacher_id: userId,
      content,
      tag,
      created_at: createdAt
    }, { status: 201 });

    response.headers.set("x-user-id", userId);
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, "failed to create note", err);
  }
});

function getStudentId(params: Record<string, string> | undefined, request: Request): string | null {
  if (params?.studentId) {
    return params.studentId;
  }
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("students");
  if (idx !== -1 && segments.length > idx + 1) {
    return segments[idx + 1] ?? null;
  }
  return null;
}
