import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { withRoute } from "../../../_lib/with-route";

export const GET = withRoute(async ({ request, params, requestId }) => {
  const { supabase, userId } = await requireAuth(request);
  const studentId = getStudentId(params, request);
  if (!studentId) {
    throw new ApiError(400, "missing student_id");
  }

  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, current_grade, academic_year, batch_name, created_at")
    .eq("id", studentId)
    .eq("teacher_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new ApiError(404, "student not found");
    }
    throw new ApiError(500, "failed to fetch student", error);
  }


  const response = NextResponse.json(data, { status: 200 });
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
