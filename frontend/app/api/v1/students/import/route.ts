import { NextResponse } from "next/server";
import { ApiError } from "../../../_lib/api-error";
import { requireAuth } from "../../../_lib/auth";
import { withRoute } from "../../../_lib/with-route";

type ImportError = {
  row: number;
  error: string;
};

type ImportResult = {
  inserted_count: number;
  skipped_count: number;
  errors: ImportError[];
};

type StudentRow = {
  teacher_id: string;
  full_name: string;
  current_grade: number;
  academic_year: string;
  batch_name: string | null;
};

const MAX_CSV_BYTES = 2_000_000;

export const POST = withRoute(async ({ request, requestId }) => {
  const { supabase, userId } = await requireAuth(request);

  const contentType = request.headers.get("content-type") ?? "";
  let csvText = "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      throw new ApiError(400, "file is required");
    }
    if (file.size > MAX_CSV_BYTES) {
      throw new ApiError(413, "CSV file too large");
    }
    csvText = await file.text();
  } else {
    csvText = await request.text();
  }

  if (csvText.length > MAX_CSV_BYTES) {
    throw new ApiError(413, "CSV payload too large");
  }

  if (!csvText.trim()) {
    throw new ApiError(400, "CSV is empty");
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new ApiError(400, "CSV has no rows");
  }

  const headerRow = rows[0].map((header) => header.trim().replace(/^\uFEFF/, "").toLowerCase());
  const headerMap = new Map<string, number>();
  headerRow.forEach((header, index) => {
    if (header) {
      headerMap.set(header, index);
    }
  });

  const requiredHeaders = ["full_name", "current_grade", "academic_year"];
  const missingHeaders = requiredHeaders.filter((header) => !headerMap.has(header));
  if (missingHeaders.length > 0) {
    throw new ApiError(400, `missing columns: ${missingHeaders.join(", ")}`);
  }

  const batchIndex = headerMap.get("batch") ?? headerMap.get("batch_name") ?? null;

  const errors: ImportError[] = [];
  const validRows: StudentRow[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.every((cell) => cell.trim() === "")) {
      continue;
    }

    const rowNumber = i + 1;
    const fullName = getCell(row, headerMap.get("full_name")!).trim();
    const academicYear = getCell(row, headerMap.get("academic_year")!).trim();
    const gradeRaw = getCell(row, headerMap.get("current_grade")!).trim();
    const batchName = batchIndex !== null ? getCell(row, batchIndex).trim() : "";

    if (!fullName) {
      errors.push({ row: rowNumber, error: "full_name is required" });
      continue;
    }
    if (!academicYear) {
      errors.push({ row: rowNumber, error: "academic_year is required" });
      continue;
    }

    const grade = Number.parseInt(gradeRaw, 10);
    if (!Number.isFinite(grade)) {
      errors.push({ row: rowNumber, error: "current_grade must be a number" });
      continue;
    }

    validRows.push({
      teacher_id: userId,
      full_name: fullName,
      current_grade: grade,
      academic_year: academicYear,
      batch_name: batchName || null
    });
  }

  let insertedCount = 0;
  if (validRows.length > 0) {
    const { data, error } = await supabase
      .from("students")
      .insert(validRows)
      .select("id");

    if (error) {
      throw new ApiError(500, "failed to import students", error);
    }

    insertedCount = data?.length ?? validRows.length;
  }

  const result: ImportResult = {
    inserted_count: insertedCount,
    skipped_count: errors.length + Math.max(validRows.length - insertedCount, 0),
    errors
  };

  const response = NextResponse.json(result, { status: 200 });
  response.headers.set("x-user-id", userId);
  response.headers.set("x-request-id", requestId);
  return response;
});

function getCell(row: string[], index: number): string {
  return row[index] ?? "";
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}
