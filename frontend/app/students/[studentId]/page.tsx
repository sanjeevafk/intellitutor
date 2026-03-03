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
};

type Note = {
  id: string;
  student_id: string;
  teacher_id: string;
  content: string;
  tag: string | null;
  created_at: string;
};

type WeeklySummary = {
  id: string;
  student_id: string;
  teacher_id: string;
  week_start: string;
  summary_text: string;
  generated_at: string;
} | null;

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export default function StudentDetailPage({ params }: { params: { studentId: string } }) {
  const router = useRouter();
  const studentId = params.studentId;
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [summary, setSummary] = useState<WeeklySummary>(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteTag, setNoteTag] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTag, setEditTag] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const canEdit = useMemo(() => {
    return (note: Note) => {
      const created = new Date(note.created_at).getTime();
      return Date.now() - created <= EDIT_WINDOW_MS;
    };
  }, []);

  useEffect(() => {
    const loadStudent = async () => {
      setLoading(true);
      setLoadError(null);
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/login");
        return;
      }

      try {
        const [studentRes, notesRes, summaryRes] = await Promise.all([
          fetch(buildApiUrl(`/api/v1/students/${studentId}`), {
            headers: { Authorization: `Bearer ${session.access_token}` }
          }),
          fetch(buildApiUrl(`/api/v1/students/${studentId}/notes`), {
            headers: { Authorization: `Bearer ${session.access_token}` }
          }),
          fetch(buildApiUrl(`/api/v1/students/${studentId}/summaries/weekly`), {
            headers: { Authorization: `Bearer ${session.access_token}` }
          })
        ]);

        if (!studentRes.ok) {
          throw new Error(`Student fetch failed: ${studentRes.status}`);
        }

        const studentPayload = (await studentRes.json()) as Student;
        setStudent(studentPayload);

        if (notesRes.ok) {
          const notesPayload = (await notesRes.json()) as Note[];
          setNotes(notesPayload);
        }

        if (summaryRes.ok) {
          const summaryPayload = (await summaryRes.json()) as WeeklySummary;
          setSummary(summaryPayload);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load student");
      } finally {
        setLoading(false);
      }
    };

    loadStudent();
  }, [router, studentId]);

  const handleAddNote = async () => {
    if (!noteContent.trim()) {
      setActionError("Note content is required");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      router.replace("/login");
      return;
    }

    setActionError(null);

    try {
      const response = await fetch(buildApiUrl(`/api/v1/students/${studentId}/notes`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: noteContent,
          tag: noteTag.trim() || null
        })
      });

      if (!response.ok) {
        throw new Error(`Add note failed: ${response.status}`);
      }

      const payload = (await response.json()) as Note;
      setNotes((prev) => [payload, ...prev]);
      setNoteContent("");
      setNoteTag("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add note");
    }
  };

  const startEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
    setEditTag(note.tag ?? "");
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditContent("");
    setEditTag("");
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editContent.trim()) {
      setActionError("Note content is required");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      router.replace("/login");
      return;
    }

    setActionError(null);

    try {
      const response = await fetch(buildApiUrl(`/api/v1/notes/${noteId}`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: editContent,
          tag: editTag.trim() || null
        })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error ?? `Update note failed: ${response.status}`);
      }

      const payload = (await response.json()) as Note;
      setNotes((prev) => prev.map((note) => (note.id === payload.id ? payload : note)));
      cancelEdit();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update note");
    }
  };

  const handleGenerateSummary = async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      router.replace("/login");
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const response = await fetch(buildApiUrl("/api/v1/summaries/weekly"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ student_id: studentId })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? `Summary failed: ${response.status}`);
      }

      setSummary(payload as WeeklySummary);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  };

  if (loading) {
    return <p className="helper">Loading...</p>;
  }

  if (loadError) {
    return (
      <div className="stack">
        <Link href="/dashboard">Back to dashboard</Link>
        <p className="helper" style={{ color: "#b42318" }}>{loadError}</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="stack">
        <Link href="/dashboard">Back to dashboard</Link>
        <p className="helper">Student not found.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <Link href="/dashboard">Back to dashboard</Link>

      <div className="card stack">
        <div>
          <h1>{student.full_name}</h1>
          <p className="helper">
            Grade {student.current_grade} · {student.academic_year}
            {student.batch_name ? ` · ${student.batch_name}` : ""}
          </p>
        </div>

        {actionError ? <p className="helper" style={{ color: "#b42318" }}>{actionError}</p> : null}

        <div className="stack">
          <h2 style={{ margin: 0 }}>Add note</h2>
          <textarea
            value={noteContent}
            onChange={(event) => setNoteContent(event.target.value)}
            rows={4}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d0d7e2" }}
            placeholder="Write a short note about today's session"
          />
          <input
            type="text"
            value={noteTag}
            onChange={(event) => setNoteTag(event.target.value)}
            placeholder="Tag (optional)"
          />
          <button type="button" onClick={handleAddNote}>Add note</button>
        </div>
      </div>

      <div className="card stack">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Weekly summary</h2>
          <button type="button" onClick={handleGenerateSummary} disabled={summaryLoading}>
            {summaryLoading ? "Generating..." : "Generate"}
          </button>
        </div>
        {summaryError ? <p className="helper" style={{ color: "#b42318" }}>{summaryError}</p> : null}
        {summary ? (
          <div>
            <p className="helper" style={{ marginTop: 0 }}>
              Week of {summary.week_start} · Generated {formatDate(summary.generated_at)}
            </p>
            <p>{summary.summary_text}</p>
          </div>
        ) : (
          <p className="helper">No summary yet.</p>
        )}
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Notes</h2>
        {notes.length === 0 ? (
          <p className="helper">No notes yet.</p>
        ) : (
          <div className="stack">
            {notes.map((note) => {
              const editable = canEdit(note);
              const isEditing = editingNoteId === note.id;
              return (
                <div key={note.id} className="card" style={{ padding: 16 }}>
                  {isEditing ? (
                    <div className="stack">
                      <textarea
                        value={editContent}
                        onChange={(event) => setEditContent(event.target.value)}
                        rows={3}
                        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #d0d7e2" }}
                      />
                      <input
                        type="text"
                        value={editTag}
                        onChange={(event) => setEditTag(event.target.value)}
                        placeholder="Tag (optional)"
                      />
                      <div style={{ display: "flex", gap: 12 }}>
                        <button type="button" onClick={() => handleUpdateNote(note.id)}>Save</button>
                        <button type="button" onClick={cancelEdit}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="stack">
                      <div>
                        <p style={{ margin: 0 }}>{note.content}</p>
                        <p className="helper" style={{ margin: "8px 0 0" }}>
                          {formatDate(note.created_at)}
                          {note.tag ? ` · ${note.tag}` : ""}
                        </p>
                      </div>
                      <div>
                        <button type="button" onClick={() => startEdit(note)} disabled={!editable}>
                          {editable ? "Edit" : "Edit window closed"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString();
}
