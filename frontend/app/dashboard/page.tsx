"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    grade: "",
    year: "",
    batch: "",
    search: ""
  });
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(filters.search.trim()), 300);
    return () => clearTimeout(handle);
  }, [filters.search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.grade.trim()) params.set("grade", filters.grade.trim());
    if (filters.year.trim()) params.set("year", filters.year.trim());
    if (filters.batch.trim()) params.set("batch", filters.batch.trim());
    if (searchTerm) params.set("search", searchTerm);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters.grade, filters.year, filters.batch, searchTerm]);

  useEffect(() => {
    const loadStudents = async () => {
      setLoading(true);
      setError(null);
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/login");
        return;
      }

      try {
        const response = await fetch(buildApiUrl(`/api/v1/students${queryString}`), {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const payload = (await response.json()) as Student[];
        setStudents(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load students");
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [queryString, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="stack">
      <div className="card stack">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1>Dashboard</h1>
            <p className="helper">Find students by grade, year, batch, or name.</p>
          </div>
          <button type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <div className="stack" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div>
            <label htmlFor="grade">Grade</label>
            <input
              id="grade"
              type="number"
              inputMode="numeric"
              value={filters.grade}
              onChange={(event) => setFilters((prev) => ({ ...prev, grade: event.target.value }))}
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
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Students</h2>
        {loading ? <p className="helper">Loading...</p> : null}
        {error ? <p className="helper" style={{ color: "#b42318" }}>{error}</p> : null}
        {!loading && !error ? (
          students.length === 0 ? (
            <p className="helper">No students found.</p>
          ) : (
            <div className="stack">
              {students.map((student) => (
                <div key={student.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ margin: "0 0 4px" }}>{student.full_name}</h3>
                      <p className="helper" style={{ margin: 0 }}>
                        Grade {student.current_grade} · {student.academic_year}
                        {student.batch_name ? ` · ${student.batch_name}` : ""}
                      </p>
                    </div>
                    <Link href={`/students/${student.id}`}>View</Link>
                  </div>
                  <p className="helper" style={{ margin: "8px 0 0" }}>
                    Last note: {student.last_note_at ? formatDate(student.last_note_at) : "No notes yet"}
                  </p>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString();
}
