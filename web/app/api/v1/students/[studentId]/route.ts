import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { withRoute } from "../../../_lib/with-route";
import { getDb } from "@/lib/db";

export const GET = withRoute(async ({ request, params, requestId }) => {
  const { userId } = await requireAuth(request);
  const studentId = getStudentId(params, request);
  if (!studentId) {
    throw new ApiError(400, "missing student_id");
  }

  const db = getDb();
  try {
    const { rows } = await db.execute({
      sql: "SELECT id, full_name, current_grade, academic_year, batch_name, created_at FROM students WHERE id = ? AND teacher_id = ?",
      args: [studentId, userId]
    });

    if (rows.length === 0) {
      throw new ApiError(404, "student not found");
    }

    const student = {
      id: rows[0].id,
      full_name: rows[0].full_name,
      current_grade: rows[0].current_grade,
      academic_year: rows[0].academic_year,
      batch_name: rows[0].batch_name,
      created_at: rows[0].created_at
    };

    const response = NextResponse.json(student, { status: 200 });
    response.headers.set("x-user-id", userId);
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, "failed to fetch student", err);
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
