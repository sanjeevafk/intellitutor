import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import { ApiError } from "../_lib/api-error";
import { requireAuth } from "../_lib/auth";
import { withRoute } from "../_lib/with-route";

type Note = {
  date: string;
  content: string;
};

type Report = {
  studentName: string;
  weekRange: string;
  notes: Note[];
  summary: string;
};

type LayoutContext = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  y: number;
};

type TextStyle = {
  fontSize: number;
  color: Color;
  lineHeight: number;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 50;
const MAX_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const COLOR_BLACK = rgb(0, 0, 0);
const COLOR_META = rgb(0.5, 0.5, 0.5);

export const runtime = "nodejs";

export const POST = withRoute(async ({ request, requestId }) => {
  const { userId } = await requireAuth(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "invalid JSON payload");
  }

  const report = parseReport(body);
  const pdfBytes = await buildReportPdf(report);
  const pdfBuffer = Buffer.from(pdfBytes);

  const response = new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=report.pdf"
    }
  });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  return response;
});

function parseReport(payload: unknown): Report {
  if (!isRecord(payload)) {
    throw new ApiError(400, "invalid report payload");
  }

  const studentName = getRequiredString(payload.studentName, "studentName");
  const weekRange = getRequiredString(payload.weekRange, "weekRange");
  const summary = getOptionalString(payload.summary, "summary");
  const notesRaw = payload.notes;

  if (!Array.isArray(notesRaw)) {
    throw new ApiError(400, "notes must be an array");
  }

  const notes = notesRaw.map((note, index) => {
    if (!isRecord(note)) {
      throw new ApiError(400, `note at index ${index} is invalid`);
    }
    const date = getRequiredString(note.date, `notes[${index}].date`);
    const content = getRequiredString(note.content, `notes[${index}].content`);
    return { date, content };
  });

  return {
    studentName,
    weekRange,
    notes,
    summary
  };
}

function getRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ApiError(400, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApiError(400, `${field} is required`);
  }
  return trimmed;
}

function getOptionalString(value: unknown, field: string): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new ApiError(400, `${field} must be a string`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function buildReportPdf(report: Report): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let ctx: LayoutContext = {
    doc,
    page,
    font,
    y: PAGE_HEIGHT - MARGIN_TOP
  };

  ctx = drawTextBlock(ctx, report.studentName, {
    fontSize: 18,
    color: COLOR_BLACK,
    lineHeight: 24
  });
  ctx = drawTextBlock(ctx, report.weekRange, {
    fontSize: 12,
    color: COLOR_META,
    lineHeight: 16
  });
  ctx = addSpacing(ctx, 24);

  ctx = drawSectionTitle(ctx, "Notes");
  ctx = addSpacing(ctx, 8);

  const notes = sortNotes(report.notes);
  if (notes.length === 0) {
    ctx = drawTextBlock(ctx, "No notes available.", {
      fontSize: 11,
      color: COLOR_META,
      lineHeight: 16
    });
  } else {
    notes.forEach((note, index) => {
      ctx = drawTextBlock(ctx, note.date, {
        fontSize: 10,
        color: COLOR_META,
        lineHeight: 14
      });
      ctx = addSpacing(ctx, 10);
      ctx = drawTextBlock(ctx, note.content, {
        fontSize: 11,
        color: COLOR_BLACK,
        lineHeight: 16
      });
      if (index < notes.length - 1) {
        ctx = addSpacing(ctx, 20);
      }
    });
  }

  ctx = addSpacing(ctx, 24);
  ctx = drawSectionTitle(ctx, "Summary");
  ctx = addSpacing(ctx, 8);
  ctx = drawTextBlock(ctx, report.summary || "No summary provided.", {
    fontSize: 11,
    color: COLOR_BLACK,
    lineHeight: 16
  });

  return doc.save();
}

function drawSectionTitle(ctx: LayoutContext, title: string): LayoutContext {
  return drawTextBlock(ctx, title, {
    fontSize: 14,
    color: COLOR_BLACK,
    lineHeight: 20
  });
}

function drawTextBlock(ctx: LayoutContext, text: string, style: TextStyle): LayoutContext {
  const lines = wrapText(text, ctx.font, style.fontSize, MAX_WIDTH);
  lines.forEach((line) => {
    ctx = addPageIfNeeded(ctx, style.lineHeight);
    ctx.page.drawText(line, {
      x: MARGIN_LEFT,
      y: ctx.y,
      size: style.fontSize,
      font: ctx.font,
      color: style.color
    });
    ctx.y -= style.lineHeight;
  });
  return ctx;
}

function addSpacing(ctx: LayoutContext, amount: number): LayoutContext {
  ctx = addPageIfNeeded(ctx, amount);
  ctx.y -= amount;
  return ctx;
}

function addPageIfNeeded(ctx: LayoutContext, requiredHeight: number): LayoutContext {
  if (ctx.y - requiredHeight < MARGIN_BOTTOM) {
    const nextPage = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    return {
      ...ctx,
      page: nextPage,
      y: PAGE_HEIGHT - MARGIN_TOP
    };
  }
  return ctx;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (!sanitized) {
    return [""];
  }

  const words = sanitized.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(nextLine, fontSize);

    if (width <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    const split = breakLongWord(word, font, fontSize, maxWidth);
    lines.push(...split.slice(0, -1));
    currentLine = split[split.length - 1] ?? "";
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function breakLongWord(
  word: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const segments: string[] = [];
  let buffer = "";

  for (const char of word) {
    const candidate = buffer + char;
    const width = font.widthOfTextAtSize(candidate, fontSize);

    if (width <= maxWidth) {
      buffer = candidate;
      continue;
    }

    if (buffer) {
      segments.push(buffer);
      buffer = char;
    } else {
      segments.push(char);
      buffer = "";
    }
  }

  if (buffer) {
    segments.push(buffer);
  }

  return segments;
}

function sortNotes(notes: Note[]): Note[] {
  const mapped = notes.map((note, index) => {
    const timestamp = Date.parse(note.date);
    return {
      note,
      timestamp: Number.isNaN(timestamp) ? null : timestamp,
      index
    };
  });

  mapped.sort((a, b) => {
    if (a.timestamp !== null && b.timestamp !== null) {
      return a.timestamp - b.timestamp;
    }
    if (a.timestamp !== null) {
      return -1;
    }
    if (b.timestamp !== null) {
      return 1;
    }
    return a.index - b.index;
  });

  return mapped.map((entry) => entry.note);
}
