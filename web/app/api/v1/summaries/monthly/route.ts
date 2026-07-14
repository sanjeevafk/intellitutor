import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { generateMonthlyReport } from "../../../_lib/gemini";
import { enforceRateLimit } from "../../../_lib/ratelimit";
import { withRoute } from "../../../_lib/with-route";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

type MonthlyReportRequest = {
  student_id?: string;
  month_start?: string;
};

export const POST = withRoute(async ({ request, requestId }) => {
  const { userId } = await requireAuth(request);

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

    // 2. Fetch notes in range
    const notesRes = await db.execute({
      sql: `SELECT content, tag, created_at 
            FROM student_notes 
            WHERE student_id = ? AND teacher_id = ? AND created_at >= ? AND created_at < ? 
            ORDER BY created_at ASC`,
      args: [studentId, userId, monthStart.toISOString(), nextMonthStart.toISOString()]
    });

    const notes = notesRes.rows.map((row) => ({
      content: row.content as string,
      tag: row.tag as string | null,
      created_at: row.created_at as string
    }));

    if (notes.length === 0) {
      throw new ApiError(400, "no notes available for the selected month");
    }

    // 3. Generate monthly report
    const prompt = buildMonthlyPrompt(student.full_name as string, monthStartDate, notes);
    const report = await generateMonthlyReport(prompt);

    const reportId = randomUUID();
    const generatedAt = new Date().toISOString();

    // 4. Save report with upsert
    await db.execute({
      sql: `INSERT INTO monthly_reports (id, student_id, teacher_id, month_start, overview, strengths, areas_to_monitor, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_id, month_start) 
            DO UPDATE SET 
              overview = excluded.overview, 
              strengths = excluded.strengths, 
              areas_to_monitor = excluded.areas_to_monitor, 
              generated_at = excluded.generated_at`,
      args: [reportId, studentId, userId, monthStartDate, report.overview, report.strengths, report.areasToMonitor, generatedAt]
    });

    // 5. Query saved report
    const savedRes = await db.execute({
      sql: `SELECT id, student_id, teacher_id, month_start, overview, strengths, areas_to_monitor, generated_at 
            FROM monthly_reports 
            WHERE student_id = ? AND month_start = ? AND teacher_id = ?`,
      args: [studentId, monthStartDate, userId]
    });

    if (savedRes.rows.length === 0) {
      throw new ApiError(500, "failed to retrieve saved report");
    }

    const saved = {
      id: savedRes.rows[0].id,
      student_id: savedRes.rows[0].student_id,
      teacher_id: savedRes.rows[0].teacher_id,
      month_start: savedRes.rows[0].month_start,
      overview: savedRes.rows[0].overview,
      strengths: savedRes.rows[0].strengths,
      areas_to_monitor: savedRes.rows[0].areas_to_monitor,
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
    throw new ApiError(500, "failed to generate monthly report", err);
  }
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
