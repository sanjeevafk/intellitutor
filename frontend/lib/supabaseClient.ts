import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const normalizedSupabaseUrl = normalizeSupabaseUrl(supabaseUrl);

if (!normalizedSupabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(normalizedSupabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

function normalizeSupabaseUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, "");
  if (url.endsWith("/auth/v1")) {
    url = url.slice(0, -"/auth/v1".length);
  }
  return url;
}
