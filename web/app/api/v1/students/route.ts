import { NextResponse } from "next/server";
import { ApiError } from "../../_lib/api-error";
import { requireAuth } from "../../_lib/auth";
import { requireEnv } from "../../_lib/env";
import { getRequestId, withRoute } from "../../_lib/with-route";

export const GET = withRoute(async ({ request, requestId }) => {
  const { supabase, userId } = await requireAuth(request);
  const env = requireEnv();

  const url = new URL(request.url);
  const params = url.searchParams;
  const gradeParam = params.get("grade");
  const yearParam = params.get("year");
  const batchParam = params.get("batch");
  const searchParam = params.get("search");

  let query = supabase
    .from("students")
    .select("id, full_name, current_grade, academic_year, batch_name, created_at, last_note_at")
    .eq("teacher_id", userId)
    .order("last_note_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (gradeParam) {
    const grade = Number.parseInt(gradeParam, 10);
    if (!Number.isFinite(grade)) {
      throw new ApiError(400, "grade must be a number");
    }
    query = query.eq("current_grade", grade);
  }

  if (yearParam) {
    query = query.eq("academic_year", yearParam);
  }

  if (batchParam) {
    query = query.eq("batch_name", batchParam);
  }

  if (searchParam) {
    const normalized = searchParam.trim();
    if (normalized.length > 0) {
      const pattern = env.searchPrefixOnly ? `${normalized}%` : `%${normalized}%`;
      query = query.ilike("full_name", pattern);
    }
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, "failed to fetch students", error);
  }

  const response = NextResponse.json(data ?? [], { status: 200 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  return response;
});

type StudentInput = {
  full_name?: string;
  current_grade?: number | string;
  academic_year?: string;
  batch?: string | null;
};

export const POST = withRoute(async ({ request, requestId }) => {
  const { supabase, userId } = await requireAuth(request);

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

  const { data, error } = await supabase
    .from("students")
    .insert({
      teacher_id: userId,
      full_name: fullName,
      current_grade: gradeRaw,
      academic_year: academicYear,
      batch_name: batchName || null
    })
    .select("id, full_name, current_grade, academic_year, batch_name, created_at, last_note_at")
    .single();

  if (error) {
    throw new ApiError(500, "failed to create student", error);
  }

  const response = NextResponse.json(data, { status: 201 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  return response;
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

 
