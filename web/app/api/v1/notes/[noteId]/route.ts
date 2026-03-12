import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { withRoute } from "../../../_lib/with-route";

type NoteUpdateInput = {
  content?: string;
  tag?: string | null;
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const PUT = withRoute(async ({ request, params, requestId }) => {
  const { supabase, userId } = await requireAuth(request);
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
  const tag = body.tag?.trim() || null;

  if (!content) {
    throw new ApiError(400, "content is required");
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - EDIT_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("student_notes")
    .update({
      content,
      tag
    })
    .eq("id", noteId)
    .eq("teacher_id", userId)
    .gte("created_at", cutoff)
    .select("id, student_id, teacher_id, content, tag, created_at");

  if (error) {
    throw new ApiError(500, "failed to update note", error);
  }

  if (!data || data.length === 0) {
    const { data: existing, error: existingError } = await supabase
      .from("student_notes")
      .select("id, created_at")
      .eq("id", noteId)
      .eq("teacher_id", userId)
      .maybeSingle();

    if (existingError) {
      throw new ApiError(500, "failed to fetch note", existingError);
    }

    if (!existing) {
      throw new ApiError(404, "note not found");
    }

    throw new ApiError(403, "note edit window expired");
  }

  const response = NextResponse.json(data[0], { status: 200 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  return response;
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
