import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { withRoute } from "../../../_lib/with-route";
import { getDb } from "@/lib/db";

type NoteUpdateInput = {
  content?: string;
  tag?: string | null;
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const PUT = withRoute(async ({ request, params, requestId }) => {
  const { userId } = await requireAuth(request);
  const { noteId, usedFallback } = getNoteId(params, request);
  if (!noteId) {
    throw new ApiError(400, "missing note_id");
  }
  if (usedFallback && isDebugEnabled()) {
    console.log(JSON.stringify({
      event: "note_update_note_id_fallback",
      request_id: requestId,
      note_id: noteId
    }));
  }

  let body: NoteUpdateInput;
  try {
    body = (await request.json()) as NoteUpdateInput;
  } catch {
    throw new ApiError(400, "invalid JSON payload");
  }
  const content = body.content?.trim();
  const tag = body.tag !== undefined ? (body.tag?.trim() || null) : undefined;

  if (!content) {
    throw new ApiError(400, "content is required");
  }

  const db = getDb();
  try {
    // 1. Fetch the existing note
    const noteRes = await db.execute({
      sql: "SELECT id, student_id, teacher_id, content, tag, created_at FROM student_notes WHERE id = ? AND teacher_id = ?",
      args: [noteId, userId]
    });

    if (noteRes.rows.length === 0) {
      throw new ApiError(404, "note not found");
    }

    const note = noteRes.rows[0];
    const createdAt = new Date(note.created_at as string);
    const now = new Date();

    // 2. Validate edit window
    if (now.getTime() - createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ApiError(403, "note edit window expired");
    }

    const nowStr = now.toISOString();

    // 3. Perform update (and update student's last_note_at)
    if (tag !== undefined) {
      await db.batch([
        {
          sql: "UPDATE student_notes SET content = ?, tag = ? WHERE id = ? AND teacher_id = ?",
          args: [content, tag, noteId, userId]
        },
        {
          sql: "UPDATE students SET last_note_at = ? WHERE id = ? AND teacher_id = ?",
          args: [nowStr, note.student_id, userId]
        }
      ]);
    } else {
      await db.batch([
        {
          sql: "UPDATE student_notes SET content = ? WHERE id = ? AND teacher_id = ?",
          args: [content, noteId, userId]
        },
        {
          sql: "UPDATE students SET last_note_at = ? WHERE id = ? AND teacher_id = ?",
          args: [nowStr, note.student_id, userId]
        }
      ]);
    }

    const updatedNote = {
      id: note.id,
      student_id: note.student_id,
      teacher_id: note.teacher_id,
      content,
      tag: tag !== undefined ? tag : note.tag,
      created_at: note.created_at
    };

    const response = NextResponse.json(updatedNote, { status: 200 });
    response.headers.set("x-user-id", userId);
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, "failed to update note", err);
  }
});

function getNoteId(
  params: Record<string, string> | undefined,
  request: Request
): { noteId: string | null; usedFallback: boolean } {
  if (params?.noteId) {
    return { noteId: params.noteId, usedFallback: false };
  }
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("notes");
  if (idx !== -1 && segments.length > idx + 1) {
    return { noteId: segments[idx + 1] ?? null, usedFallback: true };
  }
  return { noteId: null, usedFallback: true };
}

function isDebugEnabled(): boolean {
  return (process.env.NOTE_UPDATE_DEBUG ?? "").trim() === "1";
}
