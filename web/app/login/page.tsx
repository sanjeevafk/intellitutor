"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate Google sign-in.");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* Dynamic background gradient elements */}
      <div className="auth-bg-blob auth-bg-blob-1" />
      <div className="auth-bg-blob auth-bg-blob-2" />

      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo-container">
              <IntelliTutorLogo />
            </div>
            <h1 className="auth-title">IntelliTutor</h1>
            <p className="auth-sub">Sign in to coordinate your classes, students, and notes.</p>
          </div>

          <button
            type="button"
            className="btn-google"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
          >
            <GoogleIcon />
            {googleLoading ? "Connecting to Google..." : "Continue with Google"}
          </button>

          {error ? (
            <p className="auth-error">
              {error}
            </p>
          ) : null}

          <div className="auth-features-list">
            <div className="auth-feature-item">
              <span className="auth-feature-num">01</span>
              <span>AI-powered lesson & weekly summaries</span>
            </div>
            <div className="auth-feature-item">
              <span className="auth-feature-num">02</span>
              <span>Real-time student tracking & metrics</span>
            </div>
            <div className="auth-feature-item">
              <span className="auth-feature-num">03</span>
              <span>Structured notes & progress timeline</span>
            </div>
            <div className="auth-feature-item">
              <span className="auth-feature-num">04</span>
              <span>Quick CSV roster uploads</span>
            </div>
          </div>
        </div>

        <div className="auth-footer">
          <p>© {new Date().getFullYear()} IntelliTutor. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

function IntelliTutorLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M7 9.5v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-5" />
      <path d="M12 12v6" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" />
    </svg>
  );
}

