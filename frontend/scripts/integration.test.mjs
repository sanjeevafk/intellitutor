import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "TEST_TEACHER_EMAIL",
  "TEST_TEACHER_PASSWORD"
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const baseUrl = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const email = process.env.TEST_TEACHER_EMAIL;
const password = process.env.TEST_TEACHER_PASSWORD;

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
  email,
  password
});

if (authError || !authData.session || !authData.user) {
  throw new Error(`Failed to sign in test user: ${authError?.message ?? "unknown error"}`);
}

const token = authData.session.access_token;
const userId = authData.user.id;

const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } }
});

const teacherEmail = authData.user.email ?? email;
const { error: teacherError } = await authedClient
  .from("teachers")
  .upsert({ id: userId, email: teacherEmail });

if (teacherError) {
  throw new Error(`Failed to ensure teacher row: ${teacherError.message}`);
}

const studentName = `Test Student ${crypto.randomUUID().slice(0, 8)}`;
const { data: student, error: studentError } = await authedClient
  .from("students")
  .insert({
    teacher_id: userId,
    full_name: studentName,
    current_grade: 7,
    academic_year: "2025-26",
    batch_name: "Test"
  })
  .select("id")
  .single();

if (studentError || !student) {
  throw new Error(`Failed to insert student: ${studentError?.message ?? "unknown"}`);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json"
};

const listRes = await fetch(`${baseUrl}/api/v1/students?search=${encodeURIComponent("Test Student")}`, {
  headers
});
assert.equal(listRes.status, 200, `Expected 200 for students list, got ${listRes.status}`);

const noteRes = await fetch(`${baseUrl}/api/v1/students/${student.id}/notes`, {
  method: "POST",
  headers,
  body: JSON.stringify({ content: "Focused well on fractions", tag: "math" })
});
assert.equal(noteRes.status, 201, `Expected 201 for add note, got ${noteRes.status}`);
const notePayload = await noteRes.json();
assert.ok(notePayload?.id, "Expected note id");

const updateRes = await fetch(`${baseUrl}/api/v1/notes/${notePayload.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ content: "Focused well on fractions and decimals", tag: "math" })
});
assert.equal(updateRes.status, 200, `Expected 200 for update note, got ${updateRes.status}`);

const summaryRes = await fetch(`${baseUrl}/api/v1/summaries/weekly`, {
  method: "POST",
  headers,
  body: JSON.stringify({ student_id: student.id })
});
assert.equal(summaryRes.status, 200, `Expected 200 for weekly summary, got ${summaryRes.status}`);
const summaryPayload = await summaryRes.json();
assert.ok(summaryPayload?.summary_text, "Expected summary_text in response");

console.log("Integration tests passed.");
