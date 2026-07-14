import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { createClient } from "@libsql/client";

// 1. Load environment variables from .env.local
try {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.warn("Failed to load .env.local in test:", e.message);
}

const jwtSecret = process.env.JWT_SECRET;
const dbUrl = process.env.TURSO_DATABASE_URL;
const baseUrl = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

if (!jwtSecret) {
  throw new Error("Missing required env var: JWT_SECRET");
}
if (!dbUrl) {
  throw new Error("Missing required env var: TURSO_DATABASE_URL");
}

// 2. Initialize db client and create test teacher
const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined
});

const teacherId = crypto.randomUUID();
const teacherEmail = "test-teacher@example.com";

await db.execute({
  sql: "INSERT OR IGNORE INTO teachers (id, email) VALUES (?, ?)",
  args: [teacherId, teacherEmail]
});

// 3. Generate a custom JWT signed token for the teacher
const secret = new TextEncoder().encode(jwtSecret);
const token = await new SignJWT({ email: teacherEmail, sub: teacherId })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(secret);

// 4. Seed a test student directly in the SQLite database
const studentId = crypto.randomUUID();
const studentName = `Test Student ${crypto.randomUUID().slice(0, 8)}`;
await db.execute({
  sql: `INSERT INTO students (id, teacher_id, full_name, current_grade, academic_year, batch_name, created_at, last_note_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
  args: [studentId, teacherId, studentName, 7, "2025-26", "Test", new Date().toISOString()]
});

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json"
};

// 5. Query student list via API
const listRes = await fetch(`${baseUrl}/api/v1/students?search=${encodeURIComponent("Test Student")}`, {
  headers
});
assert.equal(listRes.status, 200, `Expected 200 for students list, got ${listRes.status}`);

// 6. Add student note via API
const noteRes = await fetch(`${baseUrl}/api/v1/students/${studentId}/notes`, {
  method: "POST",
  headers,
  body: JSON.stringify({ content: "Focused well on fractions", tag: "math" })
});
assert.equal(noteRes.status, 201, `Expected 201 for add note, got ${noteRes.status}`);
const notePayload = await noteRes.json();
assert.ok(notePayload?.id, "Expected note id");

// 7. Update note via API
const updateRes = await fetch(`${baseUrl}/api/v1/notes/${notePayload.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ content: "Focused well on fractions and decimals", tag: "math" })
});
assert.equal(updateRes.status, 200, `Expected 200 for update note, got ${updateRes.status}`);

// 8. Generate weekly summary via API
const summaryRes = await fetch(`${baseUrl}/api/v1/summaries/weekly`, {
  method: "POST",
  headers,
  body: JSON.stringify({ student_id: studentId })
});
assert.equal(summaryRes.status, 200, `Expected 200 for weekly summary, got ${summaryRes.status}`);
const summaryPayload = await summaryRes.json();
assert.ok(summaryPayload?.summary_text, "Expected summary_text in response");

console.log("Integration tests passed.");
