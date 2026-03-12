"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Check for OAuth error in URL params
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error") || params.get("error_description");
    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        authListener.subscription.unsubscribe();
        router.replace("/dashboard");
      }
    });

    // Also handle the case where the session is already set by the time this
    // effect runs (race-condition safety).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        authListener.subscription.unsubscribe();
        router.replace("/dashboard");
      }
    }).catch(() => {
      // Session check failed; auth listener or timeout will handle fallback
    });

    // Timeout fallback if auth doesn't complete
    const timeout = setTimeout(() => {
      authListener.subscription.unsubscribe();
      router.replace("/login?error=Authentication+timed+out");
    }, 10000);

    return () => {
      clearTimeout(timeout);
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="card stack" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
      <p>Completing sign-in…</p>
    </div>
  );
}
