import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { generateMonthlyReport } from "../../../_lib/gemini";
import { enforceRateLimit } from "../../../_lib/ratelimit";
import { withRoute } from "../../../_lib/with-route";

type MonthlyReportRequest = {
  student_id?: string;
  month_start?: string;
};

export const POST = withRoute(async ({ request, requestId }) => {
  const { supabase, userId } = await requireAuth(request);

  let body: MonthlyReportRequest;
  try {
    body = (await request.json()) as MonthlyReportRequest;
  } catch {
    throw new ApiError(400, "invalid JSON payload");
  }
  const studentId = body.student_id;
  if (!studentId) {
    throw new ApiError(400, "student_id is required");
  }

  const monthStart = parseMonthStart(body.month_start);
  const monthStartDate = monthStart.toISOString().slice(0, 10);
  const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  const rateResult = await enforceRateLimit(`monthly_report:${userId}`);

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("id", studentId)
    .eq("teacher_id", userId)
    .single();

  if (studentError) {
    if (studentError.code === "PGRST116") {
      throw new ApiError(404, "student not found");
    }
    throw new ApiError(500, "failed to fetch student", studentError);
  }

  if (!student) {
    throw new ApiError(404, "student not found");
  }

  const { data: notes, error: notesError } = await supabase
    .from("student_notes")
    .select("content, tag, created_at")
    .eq("student_id", studentId)
    .eq("teacher_id", userId)
    .gte("created_at", monthStart.toISOString())
    .lt("created_at", nextMonthStart.toISOString())
    .order("created_at", { ascending: true });

  if (notesError) {
    throw new ApiError(500, "failed to fetch notes", notesError);
  }

  if (!notes || notes.length === 0) {
    throw new ApiError(400, "no notes available for the selected month");
  }

  const prompt = buildMonthlyPrompt(student.full_name, monthStartDate, notes);
  const report = await generateMonthlyReport(prompt);

  const { data: saved, error: saveError } = await supabase
    .from("monthly_reports")
    .upsert(
      {
        student_id: studentId,
        teacher_id: userId,
        month_start: monthStartDate,
        overview: report.overview,
        strengths: report.strengths,
        areas_to_monitor: report.areasToMonitor,
        generated_at: new Date().toISOString()
      },
      { onConflict: "student_id,month_start" }
    )
    .select("id, student_id, teacher_id, month_start, overview, strengths, areas_to_monitor, generated_at")
    .single();

  if (saveError) {
    throw new ApiError(500, "failed to save report", saveError);
  }

  const response = NextResponse.json(saved, { status: 200 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-ratelimit-limit", rateResult.limit.toString());
  response.headers.set("x-ratelimit-remaining", rateResult.remaining.toString());
  response.headers.set("x-ratelimit-reset", rateResult.reset.toString());
  return response;
});

function parseMonthStart(raw: string | undefined): Date {
  if (!raw) {
    return startOfMonthUtc(new Date());
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ApiError(400, "month_start must be YYYY-MM-DD");
  }

  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "month_start is invalid");
  }

  if (parsed.getUTCDate() !== 1) {
    throw new ApiError(400, "month_start must be the first day of the month");
  }

  return parsed;
}

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

const MAX_NOTES_IN_PROMPT = 80;
const MAX_NOTE_CHARS = 400;

function buildMonthlyPrompt(
  studentName: string,
  monthStartDate: string,
  notes: Array<{ content: string; tag: string | null; created_at: string }>
) {
  const limitedNotes = notes.slice(-MAX_NOTES_IN_PROMPT);
  const lines = limitedNotes.map((note) => {
    const tag = note.tag ? ` (tag: ${note.tag})` : "";
    const content = note.content.length > MAX_NOTE_CHARS
      ? `${note.content.slice(0, MAX_NOTE_CHARS)}...`
      : note.content;
    return `- ${note.created_at}: ${content}${tag}`;
  });

  return [
    "You are a tutoring assistant. Create a monthly report with an overview, strengths, and areas to monitor.",
    "Return JSON that matches the schema exactly.",
    `Student: ${studentName}`,
    `Month start (UTC): ${monthStartDate}`,
    `Notes included: ${limitedNotes.length} of ${notes.length}`,
    "Notes:",
    ...lines
  ].join("\n");
}
