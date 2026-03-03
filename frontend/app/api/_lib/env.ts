type EnvConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiApiKey: string;
  upstashRedisUrl: string;
  upstashRedisToken: string;
  searchPrefixOnly: boolean;
  summaryTemperature: number;
  summaryMaxTokens: number;
  summaryRateLimit: number;
  summaryRateWindow: string;
};

let cachedEnv: EnvConfig | null = null;

export function requireEnv(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const geminiApiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const upstashRedisUrl = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim();
  const upstashRedisToken = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  const geminiTestMode = (process.env.GEMINI_TEST_MODE ?? "").trim() === "1";
  const rateLimitTestMode = (process.env.RATE_LIMIT_TEST_MODE ?? "").trim() === "1";

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
  if (!geminiApiKey && !geminiTestMode) missing.push("GEMINI_API_KEY");
  if (!upstashRedisUrl && !rateLimitTestMode) missing.push("UPSTASH_REDIS_REST_URL");
  if (!upstashRedisToken && !rateLimitTestMode) missing.push("UPSTASH_REDIS_REST_TOKEN");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  cachedEnv = {
    supabaseUrl: normalizeSupabaseUrl(supabaseUrl),
    supabaseAnonKey,
    geminiApiKey,
    upstashRedisUrl,
    upstashRedisToken,
    searchPrefixOnly: (process.env.SEARCH_PREFIX_ONLY ?? "").trim() === "1",
    summaryTemperature: parseNumberOrDefault(process.env.SUMMARY_TEMPERATURE, 0.2),
    summaryMaxTokens: parseNumberOrDefault(process.env.SUMMARY_MAX_TOKENS, 256),
    summaryRateLimit: parseNumberOrDefault(process.env.SUMMARY_RATE_LIMIT, 10),
    summaryRateWindow: (process.env.SUMMARY_RATE_WINDOW ?? "1 h").trim()
  };

  return cachedEnv;
}

function parseNumberOrDefault(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSupabaseUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, "");
  if (url.endsWith("/auth/v1")) {
    url = url.slice(0, -"/auth/v1".length);
  }
  return url;
}
