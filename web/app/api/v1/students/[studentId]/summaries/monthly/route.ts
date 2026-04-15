import { NextResponse } from "next/server";
import { ApiError } from "../../../../../_lib/api-error";
import { requireAuth } from "../../../../../_lib/auth";
import { withRoute } from "../../../../../_lib/with-route";

export const GET = withRoute(async ({ request, params, requestId }) => {
  const { supabase, userId } = await requireAuth(request);
  const studentId = getStudentId(params, request);
  if (!studentId) {
    throw new ApiError(400, "missing student_id");
  }

  const { data, error } = await supabase
    .from("monthly_reports")
    .select("id, student_id, teacher_id, month_start, overview, strengths, areas_to_monitor, generated_at")
    .eq("student_id", studentId)
    .eq("teacher_id", userId)
    .order("month_start", { ascending: false })
    .limit(1);

  if (error) {
    throw new ApiError(500, "failed to fetch report", error);
  }

  const report = data?.[0] ?? null;
  const response = NextResponse.json(report, { status: 200 });
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
