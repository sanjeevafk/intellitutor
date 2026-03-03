"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStudents = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/login");
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/students`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const payload = await response.json();
        setStudents(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load students");
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [router]);

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
            <p className="helper">Raw student list from the API.</p>
          </div>
          <button type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
        {loading ? <p className="helper">Loading...</p> : null}
        {error ? <p className="helper" style={{ color: "#b42318" }}>{error}</p> : null}
        {!loading && !error ? (
          <pre>{JSON.stringify(students, null, 2)}</pre>
        ) : null}
      </div>
    </div>
  );
}
