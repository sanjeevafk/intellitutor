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
  const noteId = params?.noteId;
  if (!noteId) {
    throw new ApiError(400, "missing note_id");
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

  const { data: existing, error: existingError } = await supabase
    .from("student_notes")
    .select("id, created_at")
    .eq("id", noteId)
    .single();

  if (existingError) {
    if (existingError.code === "PGRST116") {
      throw new ApiError(404, "note not found");
    }
    throw new ApiError(500, "failed to fetch note", existingError);
  }

  if (!existing) {
    throw new ApiError(404, "note not found");
  }

  const createdAt = new Date(existing.created_at).getTime();
  if (Date.now() - createdAt > EDIT_WINDOW_MS) {
    throw new ApiError(409, "note edit window expired");
  }

  const cutoff = new Date(Date.now() - EDIT_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("student_notes")
    .update({
      content,
      tag
    })
    .eq("id", noteId)
    .gte("created_at", cutoff)
    .select("id, student_id, teacher_id, content, tag, created_at");

  if (error) {
    throw new ApiError(500, "failed to update note", error);
  }

  if (!data || data.length === 0) {
    throw new ApiError(409, "note edit window expired");
  }

  const response = NextResponse.json(data[0], { status: 200 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  return response;
});
