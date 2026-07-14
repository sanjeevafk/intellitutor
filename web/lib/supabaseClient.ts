// Custom auth client that matches the subset of SupabaseClient used in the frontend.
// It uses localStorage to manage session state and handles JWT-based authentication.

type Session = {
  access_token: string;
  user?: {
    id: string;
    email: string;
  };
};

type AuthListener = (event: "SIGNED_IN" | "SIGNED_OUT", session: Session | null) => void;

class CustomAuthClient {
  private listeners = new Set<AuthListener>();

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === "tutor_auth_token") {
          const session = this.getSessionSync();
          this.emit(session ? "SIGNED_IN" : "SIGNED_OUT", session);
        }
      });
    }
  }

  private emit(event: "SIGNED_IN" | "SIGNED_OUT", session: Session | null) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, session);
      } catch (err) {
        console.error("Auth listener error:", err);
      }
    });
  }

  private getSessionSync(): Session | null {
    if (typeof window === "undefined") return null;
    const token = localStorage.getItem("tutor_auth_token");
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        localStorage.removeItem("tutor_auth_token");
        return null;
      }
      return {
        access_token: token,
        user: {
          id: payload.sub || payload.id,
          email: payload.email
        }
      };
    } catch {
      return null;
    }
  }

  async getSession(): Promise<{ data: { session: Session | null } }> {
    return { data: { session: this.getSessionSync() } };
  }

  onAuthStateChange(callback: AuthListener) {
    this.listeners.add(callback);
    const session = this.getSessionSync();
    
    // Defer the execution of the callback to allow listener mounting sequence to resolve cleanly
    if (typeof window !== "undefined") {
      setTimeout(() => {
        if (this.listeners.has(callback)) {
          callback(session ? "SIGNED_IN" : "SIGNED_OUT", session);
        }
      }, 0);
    }

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners.delete(callback);
          }
        }
      }
    };
  }

  async signOut(): Promise<{ error: Error | null }> {
    if (typeof window !== "undefined") {
      localStorage.removeItem("tutor_auth_token");
    }
    this.emit("SIGNED_OUT", null);
    return { error: null };
  }

  async signInWithOAuth({ provider, options }: { provider: string; options?: { redirectTo?: string } }) {
    if (provider !== "google") {
      return { error: new Error("Only Google OAuth is supported") };
    }
    
    const redirectUri = options?.redirectTo || `${window.location.origin}/auth/callback`;
    const params = new URLSearchParams({ redirect_uri: redirectUri });
    window.location.href = `/api/auth/login?${params.toString()}`;
    
    return new Promise<{ error: null }>(() => {});
  }
}

export const supabase = {
  auth: new CustomAuthClient()
};
export type { Session };
