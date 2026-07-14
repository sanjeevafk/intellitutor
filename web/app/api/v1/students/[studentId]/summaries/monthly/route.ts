import { NextResponse } from "next/server";
import { ApiError } from "../../../../../_lib/api-error";
import { requireAuth } from "../../../../../_lib/auth";
import { withRoute } from "../../../../../_lib/with-route";
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
      sql: `SELECT id, student_id, teacher_id, month_start, overview, strengths, areas_to_monitor, generated_at 
            FROM monthly_reports 
            WHERE student_id = ? AND teacher_id = ? 
            ORDER BY month_start DESC 
            LIMIT 1`,
      args: [studentId, userId]
    });

    const report = rows.length > 0 ? {
      id: rows[0].id,
      student_id: rows[0].student_id,
      teacher_id: rows[0].teacher_id,
      month_start: rows[0].month_start,
      overview: rows[0].overview,
      strengths: rows[0].strengths,
      areas_to_monitor: rows[0].areas_to_monitor,
      generated_at: rows[0].generated_at
    } : null;

    const response = NextResponse.json(report, { status: 200 });
    response.headers.set("x-user-id", userId);
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (err) {
    throw new ApiError(500, "failed to fetch report", err);
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
