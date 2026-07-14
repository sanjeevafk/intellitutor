import { NextResponse } from "next/server";
import { ApiError } from "../../_lib/api-error";
import { requireAuth } from "../../_lib/auth";
import { requireEnv } from "../../_lib/env";
import { getRequestId, withRoute } from "../../_lib/with-route";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export const GET = withRoute(async ({ request, requestId }) => {
  const { userId } = await requireAuth(request);
  const env = requireEnv();
  const db = getDb();

  const url = new URL(request.url);
  const params = url.searchParams;
  const gradeParam = params.get("grade");
  const yearParam = params.get("year");
  const batchParam = params.get("batch");
  const searchParam = params.get("search");

  let sql = `SELECT id, full_name, current_grade, academic_year, batch_name, created_at, last_note_at 
             FROM students 
             WHERE teacher_id = ?`;
  const args: any[] = [userId];

  if (gradeParam) {
    const grade = Number.parseInt(gradeParam, 10);
    if (!Number.isFinite(grade)) {
      throw new ApiError(400, "grade must be a number");
    }
    sql += " AND current_grade = ?";
    args.push(grade);
  }

  if (yearParam) {
    sql += " AND academic_year = ?";
    args.push(yearParam);
  }

  if (batchParam) {
    sql += " AND batch_name = ?";
    args.push(batchParam);
  }

  if (searchParam) {
    const normalized = searchParam.trim();
    if (normalized.length > 0) {
      // Escape LIKE wildcards
      const escaped = normalized.replace(/[%_\\]/g, '\\$&');
      const pattern = env.searchPrefixOnly ? `${escaped}%` : `%${escaped}%`;
      sql += " AND LOWER(full_name) LIKE LOWER(?) ESCAPE '\\'";
      args.push(pattern);
    }
  }

  sql += " ORDER BY last_note_at IS NULL ASC, last_note_at DESC, created_at DESC";

  try {
    const { rows } = await db.execute({ sql, args });
    
    // Transform rows array to match standard JS objects if needed
    const students = rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      current_grade: row.current_grade,
      academic_year: row.academic_year,
      batch_name: row.batch_name,
      created_at: row.created_at,
      last_note_at: row.last_note_at
    }));

    const response = NextResponse.json(students, { status: 200 });
    response.headers.set("x-user-id", userId);
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (err) {
    throw new ApiError(500, "failed to fetch students", err);
  }
});

type StudentInput = {
  full_name?: string;
  current_grade?: number | string;
  academic_year?: string;
  batch?: string | null;
};

export const POST = withRoute(async ({ request, requestId }) => {
  const { userId } = await requireAuth(request);
  const db = getDb();

  let body: StudentInput;
  try {
    body = (await request.json()) as StudentInput;
  } catch {
    throw new ApiError(400, "invalid JSON payload");
  }

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const academicYear = typeof body.academic_year === "string" ? body.academic_year.trim() : "";
  const gradeRaw = typeof body.current_grade === "string" || typeof body.current_grade === "number"
    ? Number.parseInt(body.current_grade.toString(), 10)
    : Number.NaN;
  const batchName = typeof body.batch === "string" ? body.batch.trim() : "";

  if (!fullName) {
    throw new ApiError(400, "full_name is required");
  }
  if (!academicYear) {
    throw new ApiError(400, "academic_year is required");
  }
  if (!Number.isFinite(gradeRaw)) {
    throw new ApiError(400, "current_grade must be a number");
  }

  const studentId = randomUUID();
  const createdAt = new Date().toISOString();

  try {
    await db.execute({
      sql: `INSERT INTO students (id, teacher_id, full_name, current_grade, academic_year, batch_name, created_at, last_note_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      args: [studentId, userId, fullName, gradeRaw, academicYear, batchName || null, createdAt]
    });

    const response = NextResponse.json({
      id: studentId,
      full_name: fullName,
      current_grade: gradeRaw,
      academic_year: academicYear,
      batch_name: batchName || null,
      created_at: createdAt,
      last_note_at: null
    }, { status: 201 });

    response.headers.set("x-user-id", userId);
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (err) {
    throw new ApiError(500, "failed to create student", err);
  }
});

export async function OPTIONS(request: Request) {
  const requestId = getRequestId(request);
  return new NextResponse(null, {
    status: 204,
    headers: {
      "x-request-id": requestId
    }
  });
}
