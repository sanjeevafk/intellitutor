import { NextResponse } from "next/server";
import { ApiError } from "../../../../_lib/api-error";
import { requireAuth } from "../../../../_lib/auth";
import { withRoute } from "../../../../_lib/with-route";

type NoteInput = {
  content?: string;
  tag?: string | null;
};

export const GET = withRoute(async ({ request, params, requestId }) => {
  const { supabase, userId } = await requireAuth(request);
  const studentId = getStudentId(params, request);
  if (!studentId) {
    throw new ApiError(400, "missing student_id");
  }

  const { data, error } = await supabase
    .from("student_notes")
    .select("id, student_id, teacher_id, content, tag, created_at")
    .eq("student_id", studentId)
    .eq("teacher_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "failed to fetch notes", error);
  }

  const response = NextResponse.json(data ?? [], { status: 200 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  return response;
});

export const POST = withRoute(async ({ request, params, requestId }) => {
  const { supabase, userId } = await requireAuth(request);
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
  const tag = body.tag?.trim() || null;

  if (!content) {
    throw new ApiError(400, "content is required");
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (studentError) {
    throw new ApiError(500, "failed to verify student", studentError);
  }

  if (!student) {
    throw new ApiError(404, "student not found");
  }

  const { data, error } = await supabase
    .from("student_notes")
    .insert({
      student_id: studentId,
      teacher_id: userId,
      content,
      tag
    })
    .select("id, student_id, teacher_id, content, tag, created_at")
    .single();

  if (error) {
    throw new ApiError(500, "failed to create note", error);
  }

  const response = NextResponse.json(data, { status: 201 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  return response;
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
