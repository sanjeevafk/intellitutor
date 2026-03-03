"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL.");
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
  };

  return (
    <div className="card stack" style={{ maxWidth: 420, margin: "0 auto" }}>
      <div>
        <h1>Sign in</h1>
        <p className="helper">Use your Supabase Auth credentials.</p>
      </div>
      <form onSubmit={handleSubmit} className="stack">
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error ? (
          <p className="helper" style={{ color: "#b42318" }}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
