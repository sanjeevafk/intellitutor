"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { buildApiUrl } from "@/lib/apiClient";

type Student = {
  id: string;
  full_name: string;
  current_grade: number;
  academic_year: string;
  batch_name: string | null;
  created_at: string;
  last_note_at: string | null;
};

type ImportResult = {
  inserted_count: number;
  skipped_count: number;
  errors: Array<{ row: number; error: string }>;
};

type StatusTone = "success" | "warning" | "danger" | "muted";

async function fetcher([url, token]: readonly [string, string]) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [filters, setFilters] = useState({
    grade: "",
    year: "",
    batch: "",
    search: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    fullName: "",
    currentGrade: "",
    academicYear: "",
    batch: ""
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(filters.search.trim()), 300);
    return () => clearTimeout(handle);
  }, [filters.search]);

  useEffect(() => {
    let active = true;
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const session = data.session;
      if (!session) {
        setToken(null);
        setAuthChecked(true);
        router.replace("/login");
        return;
      }
      setToken(session.access_token);
      setAuthChecked(true);
    };

    loadSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) {
        setToken(null);
        setAuthChecked(true);
        router.replace("/login");
        return;
      }
      setToken(session.access_token);
      setAuthChecked(true);
    });

    return () => {
      active = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!isAddModalOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAddModalOpen(false);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isAddModalOpen]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.grade.trim()) params.set("grade", filters.grade.trim());
    if (filters.year.trim()) params.set("year", filters.year.trim());
    if (filters.batch.trim()) params.set("batch", filters.batch.trim());
    if (searchTerm) params.set("search", searchTerm);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters.grade, filters.year, filters.batch, searchTerm]);

  const studentsKey = token ? [buildApiUrl(`/api/v1/students${queryString}`), token] as const : null;
  const {
    data: students = [],
    error: studentsError,
    isLoading: studentsLoading,
    mutate: mutateStudents
  } = useSWR<Student[]>(studentsKey, fetcher);

  const loading = !authChecked || studentsLoading;
  const error = studentsError instanceof Error ? studentsError.message : studentsError ? "Failed to load students" : null;

  const metrics = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    let noNotes = 0;
    let activeThisWeek = 0;
    let inactive14d = 0;

    for (const student of students) {
      if (!student.last_note_at) {
        noNotes += 1;
        continue;
      }
      const timestamp = new Date(student.last_note_at).getTime();
      const days = Math.floor((now - timestamp) / oneDay);
      if (days <= 7) activeThisWeek += 1;
      if (days >= 14) inactive14d += 1;
    }

    return {
      total: students.length,
      noNotes,
      activeThisWeek,
      inactive14d
    };
  }, [students]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const clearFilters = () => {
    setFilters({
      grade: "",
      year: "",
      batch: "",
      search: ""
    });
    setSearchTerm("");
  };

  const handleAddStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fullName = addForm.fullName.trim();
    const academicYear = addForm.academicYear.trim();
    const grade = Number.parseInt(addForm.currentGrade.trim(), 10);
    const batch = addForm.batch.trim();

    if (!fullName) {
      setAddError("Full name is required.");
      return;
    }
    if (!academicYear) {
      setAddError("Academic year is required.");
      return;
    }
    if (!Number.isFinite(grade)) {
      setAddError("Grade must be a number.");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      router.replace("/login");
      return;
    }

    setAddLoading(true);
    setAddError(null);

    try {
      const response = await fetch(buildApiUrl("/api/v1/students"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          full_name: fullName,
          current_grade: grade,
          academic_year: academicYear,
          batch: batch || null
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? `Failed to create student (${response.status})`);
      }

      const payload = (await response.json()) as Student;
      mutateStudents((current) => [payload, ...(current ?? [])], { revalidate: false });
      setAddForm({ fullName: "", currentGrade: "", academicYear: "", batch: "" });
      setIsAddModalOpen(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add student");
    } finally {
      setAddLoading(false);
    }
  };

  const handleImportStudents = async () => {
    if (!importFile) {
      setImportError("CSV file is required.");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      router.replace("/login");
      return;
    }

    setImportLoading(true);
    setImportError(null);

    try {
      const formData = new FormData();
      formData.append("file", importFile);

      const response = await fetch(buildApiUrl("/api/v1/students/import"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error ?? errorPayload?.errors?.[0]?.error ?? `Import failed (${response.status})`);
      }

      const payload = (await response.json()) as ImportResult;
      setImportResult(payload);
      setImportFile(null);
      mutateStudents();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import students");
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="dashboard-shell stack">
      <section className="card dashboard-controls">
        <div className="dashboard-header">
          <div>
            <p className="dashboard-kicker">IntelliTutor Workspace</p>
            <h1 className="dashboard-title">Dashboard</h1>
            <p className="helper">Track activity, filter fast, and jump to student notes.</p>
          </div>
          <div className="dashboard-header-actions">
            <button type="button" className="btn-outline" onClick={() => setIsAddModalOpen(true)}>
              + Add student
            </button>
            <button type="button" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>

        <div className="dashboard-filter-grid">
          <div>
            <label htmlFor="grade">Grade</label>
            <input
              id="grade"
              type="number"
              inputMode="numeric"
              min={0}
              max={12}
              step={1}
              value={filters.grade}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  setFilters((prev) => ({ ...prev, grade: "" }));
                  return;
                }
                const parsed = Number.parseInt(raw, 10);
                if (Number.isNaN(parsed)) return;
                const clamped = Math.max(0, Math.min(12, parsed));
                setFilters((prev) => ({ ...prev, grade: clamped.toString() }));
              }}
              placeholder="e.g. 7"
            />
          </div>
          <div>
            <label htmlFor="year">Academic year</label>
            <input
              id="year"
              type="text"
              value={filters.year}
              onChange={(event) => setFilters((prev) => ({ ...prev, year: event.target.value }))}
              placeholder="2025-26"
            />
          </div>
          <div>
            <label htmlFor="batch">Batch</label>
            <input
              id="batch"
              type="text"
              value={filters.batch}
              onChange={(event) => setFilters((prev) => ({ ...prev, batch: event.target.value }))}
              placeholder="Evening"
            />
          </div>
          <div>
            <label htmlFor="search">Search</label>
            <input
              id="search"
              type="text"
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Student name"
            />
          </div>
        </div>
        <div className="dashboard-controls-footer">
          <p className="helper">Filters apply instantly. Search is debounced by 300ms.</p>
          <button type="button" className="btn-ghost-inline" onClick={clearFilters}>Clear filters</button>
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="Student summary">
        <article className="card metric-card">
          <p className="metric-label">Total students</p>
          <p className="metric-value">{metrics.total}</p>
        </article>
        <article className="card metric-card">
          <p className="metric-label">No notes yet</p>
          <p className="metric-value">{metrics.noNotes}</p>
        </article>
        <article className="card metric-card">
          <p className="metric-label">Active this week</p>
          <p className="metric-value">{metrics.activeThisWeek}</p>
        </article>
        <article className="card metric-card">
          <p className="metric-label">Inactive 14+ days</p>
          <p className="metric-value">{metrics.inactive14d}</p>
        </article>
      </section>

      <section className="card stack">
        <div className="dashboard-section-head">
          <h2 style={{ margin: 0 }}>Students</h2>
          <p className="helper">{students.length} shown</p>
        </div>

        {loading ? (
          <div className="stack" aria-label="Loading students">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton-row" />
            ))}
          </div>
        ) : null}

        {error ? <p className="helper" style={{ color: "#b42318" }}>{error}</p> : null}

        {!loading && !error && students.length === 0 ? (
          <div className="empty-state">
            <h3>No students found</h3>
            <p className="helper">Try clearing filters, add a student, or import a CSV file.</p>
            <button type="button" onClick={() => setIsAddModalOpen(true)}>Add first student</button>
          </div>
        ) : null}

        {!loading && !error && students.length > 0 ? (
          <>
            <div className="students-table-wrap" role="region" aria-label="Students table">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Grade</th>
                    <th>Year</th>
                    <th>Batch</th>
                    <th>Last note</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const status = getStudentStatus(student.last_note_at);
                    return (
                      <tr key={student.id}>
                        <td className="cell-name">{student.full_name}</td>
                        <td>{student.current_grade}</td>
                        <td>{student.academic_year}</td>
                        <td>{student.batch_name ?? "—"}</td>
                        <td>{student.last_note_at ? formatDate(student.last_note_at) : "No notes yet"}</td>
                        <td><span className={`status-pill status-${status.tone}`}>{status.label}</span></td>
                        <td>
                          <Link href={`/students/${student.id}`} className="view-link">View</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-student-list">
              {students.map((student) => {
                const status = getStudentStatus(student.last_note_at);
                return (
                  <article key={student.id} className="student-mobile-card">
                    <div className="student-mobile-top">
                      <h3>{student.full_name}</h3>
                      <span className={`status-pill status-${status.tone}`}>{status.label}</span>
                    </div>
                    <p className="helper">
                      Grade {student.current_grade} · {student.academic_year} · {student.batch_name ?? "No batch"}
                    </p>
                    <p className="helper">Last note: {student.last_note_at ? formatDate(student.last_note_at) : "No notes yet"}</p>
                    <Link href={`/students/${student.id}`} className="view-link">Open student</Link>
                  </article>
                );
              })}
            </div>
          </>
        ) : null}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Import CSV</h2>
        <p className="helper">Columns: full_name, current_grade, academic_year, batch (optional).</p>
        {importError ? <p className="helper" style={{ color: "#b42318" }}>{importError}</p> : null}
        {importResult ? (
          <div className="stack">
            <p className="helper" style={{ margin: 0 }}>
              Inserted {importResult.inserted_count} · Skipped {importResult.skipped_count}
            </p>
            {importResult.errors.length > 0 ? (
              <div className="stack">
                {importResult.errors.map((err) => (
                  <p key={`${err.row}-${err.error}`} className="helper" style={{ margin: 0 }}>
                    Row {err.row}: {err.error}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <label htmlFor="import-csv-file" className="helper">Choose CSV file</label>
        <input
          id="import-csv-file"
          key={importResult ? "reset" : "input"}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
        />
        <button type="button" onClick={handleImportStudents} disabled={importLoading}>
          {importLoading ? "Importing..." : "Import students"}
        </button>
      </section>

      {isAddModalOpen ? (
        <div className="modal-overlay" role="presentation" onClick={() => setIsAddModalOpen(false)}>
          <div
            className="card add-student-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-student-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dashboard-section-head">
              <h2 id="add-student-title" style={{ margin: 0 }}>Add student</h2>
              <button type="button" className="btn-ghost-inline" onClick={() => setIsAddModalOpen(false)}>Close</button>
            </div>
            <form className="stack" onSubmit={handleAddStudent}>
              {addError ? <p className="helper" style={{ color: "#b42318" }}>{addError}</p> : null}
              <div className="dashboard-filter-grid">
                <div>
                  <label htmlFor="add-full-name">Full name</label>
                  <input
                    id="add-full-name"
                    type="text"
                    value={addForm.fullName}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, fullName: event.target.value }))}
                    placeholder="Student name"
                  />
                </div>
                <div>
                  <label htmlFor="add-grade">Grade</label>
                  <input
                    id="add-grade"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={12}
                    step={1}
                    value={addForm.currentGrade}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, currentGrade: event.target.value }))}
                    placeholder="e.g. 7"
                  />
                </div>
                <div>
                  <label htmlFor="add-year">Academic year</label>
                  <input
                    id="add-year"
                    type="text"
                    value={addForm.academicYear}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, academicYear: event.target.value }))}
                    placeholder="2025-26"
                  />
                </div>
                <div>
                  <label htmlFor="add-batch">Batch (optional)</label>
                  <input
                    id="add-batch"
                    type="text"
                    value={addForm.batch}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, batch: event.target.value }))}
                    placeholder="Evening"
                  />
                </div>
              </div>
              <div className="dashboard-header-actions">
                <button type="button" className="btn-outline" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={addLoading}>
                  {addLoading ? "Adding..." : "Save student"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function getStudentStatus(lastNoteAt: string | null): { label: string; tone: StatusTone } {
  if (!lastNoteAt) {
    return { label: "No notes", tone: "muted" };
  }

  const now = Date.now();
  const timestamp = new Date(lastNoteAt).getTime();
  const diffDays = Math.floor((now - timestamp) / (24 * 60 * 60 * 1000));

  if (diffDays <= 1) return { label: "Active today", tone: "success" };
  if (diffDays <= 7) return { label: "Active week", tone: "success" };
  if (diffDays <= 14) return { label: "Needs follow-up", tone: "warning" };
  return { label: "Inactive", tone: "danger" };
}
