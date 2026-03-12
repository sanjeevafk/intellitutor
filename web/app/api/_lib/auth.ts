import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./api-error";
import { requireEnv } from "./env";

let authClient: SupabaseClient | null = null;

export type AuthContext = {
  userId: string;
  token: string;
  supabase: SupabaseClient;
};

export async function requireAuth(request: Request): Promise<AuthContext> {
  const token = readBearerToken(request);
  if (!token) {
    throw new ApiError(401, "missing authorization bearer token");
  }

  const env = requireEnv();

  if (!authClient) {
    authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    throw new ApiError(401, "invalid or expired token", error);
  }

  (request as { __userId?: string }).__userId = data.user.id;

  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  return {
    userId: data.user.id,
    token,
    supabase
  };
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token.trim();
}
