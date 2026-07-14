import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { generateWeeklySummary } from "../../../_lib/gemini";
import { enforceRateLimit } from "../../../_lib/ratelimit";
import { withRoute } from "../../../_lib/with-route";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

type WeeklySummaryRequest = {
  student_id?: string;
};

export const POST = withRoute(async ({ request, requestId }) => {
  const { userId } = await requireAuth(request);

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

  if (!rateResult.success) {
    const response = NextResponse.json(
      { error: "rate limit exceeded" },
      { status: 429 }
    );
    response.headers.set("x-ratelimit-limit", rateResult.limit.toString());
    response.headers.set("x-ratelimit-remaining", rateResult.remaining.toString());
    response.headers.set("x-ratelimit-reset", rateResult.reset.toString());
    return response;
  }

  const db = getDb();
  try {
    // 1. Fetch student
    const studentRes = await db.execute({
      sql: "SELECT id, full_name FROM students WHERE id = ? AND teacher_id = ?",
      args: [studentId, userId]
    });

    if (studentRes.rows.length === 0) {
      throw new ApiError(404, "student not found");
    }
    const student = studentRes.rows[0];

    const weekStart = startOfWeekUtc(new Date());
    const weekStartDate = weekStart.toISOString().slice(0, 10);

    // 2. Fetch notes since week start
    const notesRes = await db.execute({
      sql: `SELECT content, tag, created_at 
            FROM student_notes 
            WHERE student_id = ? AND teacher_id = ? AND created_at >= ? 
            ORDER BY created_at ASC`,
      args: [studentId, userId, weekStart.toISOString()]
    });

    const notes = notesRes.rows.map((row) => ({
      content: row.content as string,
      tag: row.tag as string | null,
      created_at: row.created_at as string
    }));

    if (notes.length === 0) {
      throw new ApiError(400, "no notes available for the current week");
    }

    // 3. Generate summary
    const prompt = buildWeeklyPrompt(student.full_name as string, weekStartDate, notes);
    const summary = await generateWeeklySummary(prompt);

    const summaryId = randomUUID();
    const generatedAt = new Date().toISOString();

    // 4. Save summary with upsert
    await db.execute({
      sql: `INSERT INTO weekly_summaries (id, student_id, teacher_id, week_start, summary_text, generated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_id, week_start) 
            DO UPDATE SET summary_text = excluded.summary_text, generated_at = excluded.generated_at`,
      args: [summaryId, studentId, userId, weekStartDate, summary.summaryText, generatedAt]
    });

    // 5. Query the final saved row to return it
    const savedRes = await db.execute({
      sql: `SELECT id, student_id, teacher_id, week_start, summary_text, generated_at 
            FROM weekly_summaries 
            WHERE student_id = ? AND week_start = ? AND teacher_id = ?`,
      args: [studentId, weekStartDate, userId]
    });

    if (savedRes.rows.length === 0) {
      throw new ApiError(500, "failed to retrieve saved summary");
    }

    const saved = {
      id: savedRes.rows[0].id,
      student_id: savedRes.rows[0].student_id,
      teacher_id: savedRes.rows[0].teacher_id,
      week_start: savedRes.rows[0].week_start,
      summary_text: savedRes.rows[0].summary_text,
      generated_at: savedRes.rows[0].generated_at
    };

    const response = NextResponse.json(saved, { status: 200 });
    response.headers.set("x-user-id", userId);
    response.headers.set("x-request-id", requestId);
    response.headers.set("x-ratelimit-limit", rateResult.limit.toString());
    response.headers.set("x-ratelimit-remaining", rateResult.remaining.toString());
    response.headers.set("x-ratelimit-reset", rateResult.reset.toString());
    return response;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, "failed to generate weekly summary", err);
  }
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
