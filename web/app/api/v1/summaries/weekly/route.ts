import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { generateWeeklySummary } from "../../../_lib/gemini";
import { enforceRateLimit } from "../../../_lib/ratelimit";
import { withRoute } from "../../../_lib/with-route";

type WeeklySummaryRequest = {
  student_id?: string;
};

export const POST = withRoute(async ({ request, requestId }) => {
  const { supabase, userId } = await requireAuth(request);

  let body: WeeklySummaryRequest;
  try {
    body = (await request.json()) as WeeklySummaryRequest;
  } catch {
    throw new ApiError(400, "invalid JSON payload");
  }
  const studentId = body.student_id;
  if (!studentId) {
    throw new ApiError(400, "student_id is required");
  }

  const rateResult = await enforceRateLimit(`weekly_summary:${userId}`);

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

  const weekStart = startOfWeekUtc(new Date());
  const weekStartDate = weekStart.toISOString().slice(0, 10);

  const { data: notes, error: notesError } = await supabase
    .from("student_notes")
    .select("content, tag, created_at")
    .eq("student_id", studentId)
    .eq("teacher_id", userId)
    .gte("created_at", weekStart.toISOString())
    .order("created_at", { ascending: true });

  if (notesError) {
    throw new ApiError(500, "failed to fetch notes", notesError);
  }

  if (!notes || notes.length === 0) {
    throw new ApiError(400, "no notes available for the current week");
  }

  const prompt = buildWeeklyPrompt(student.full_name, weekStartDate, notes);
  const summary = await generateWeeklySummary(prompt);

  const { data: saved, error: saveError } = await supabase
    .from("weekly_summaries")
    .upsert(
      {
        student_id: studentId,
        teacher_id: userId,
        week_start: weekStartDate,
        summary_text: summary.summaryText,
        generated_at: new Date().toISOString()
      },
      { onConflict: "student_id,week_start" }
    )
    .select("id, student_id, teacher_id, week_start, summary_text, generated_at")
    .single();

  if (saveError) {
    throw new ApiError(500, "failed to save summary", saveError);
  }

  const response = NextResponse.json(saved, { status: 200 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-ratelimit-limit", rateResult.limit.toString());
  response.headers.set("x-ratelimit-remaining", rateResult.remaining.toString());
  response.headers.set("x-ratelimit-reset", rateResult.reset.toString());
  return response;
});

function startOfWeekUtc(date: Date): Date {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + diff);
  return utcDate;
}

const MAX_NOTES_IN_PROMPT = 50;
const MAX_NOTE_CHARS = 400;

function buildWeeklyPrompt(studentName: string, weekStartDate: string, notes: Array<{ content: string; tag: string | null; created_at: string }>) {
  const limitedNotes = notes.slice(-MAX_NOTES_IN_PROMPT);
  const lines = limitedNotes.map((note) => {
    const tag = note.tag ? ` (tag: ${note.tag})` : "";
    const content = note.content.length > MAX_NOTE_CHARS
      ? `${note.content.slice(0, MAX_NOTE_CHARS)}…`
      : note.content;
    return `- ${note.created_at}: ${content}${tag}`;
  });

  return [
    "You are a tutoring assistant. Summarize the student's learning progress for the week.",
    "Return JSON that matches the schema exactly.",
    `Student: ${studentName}`,
    `Week start (UTC): ${weekStartDate}`,
    `Notes included: ${limitedNotes.length} of ${notes.length}`,
    "Notes:",
    ...lines
  ].join("\n");
}
