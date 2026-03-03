import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { withRoute } from "../../../_lib/with-route";

export const GET = withRoute(async ({ request, params, requestId }) => {
  const { supabase, userId } = await requireAuth(request);
  const studentId = params?.studentId;
  if (!studentId) {
    throw new ApiError(400, "missing student_id");
  }

  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, current_grade, academic_year, batch_name, created_at")
    .eq("id", studentId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new ApiError(404, "student not found");
    }
    throw new ApiError(500, "failed to fetch student", error);
  }

  if (!data) {
    throw new ApiError(404, "student not found");
  }

  const response = NextResponse.json(data, { status: 200 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  return response;
});
