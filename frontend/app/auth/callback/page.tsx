"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * OAuth callback page.
 *
 * After Google (or any OAuth provider) redirects back here with a `?code=`
 * parameter, the Supabase browser client automatically detects and exchanges
 * the PKCE code for a session (detectSessionInUrl is true by default).
 * We listen for the resulting SIGNED_IN event and redirect to /dashboard.
 * If the exchange fails we redirect to /login with an error message.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
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
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="card stack" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
      <p>Completing sign-in…</p>
    </div>
  );
}
