import type { Duration } from "@upstash/ratelimit";
import * as fs from "fs";
import * as path from "path";

type EnvConfig = {
  tursoDatabaseUrl: string;
  tursoAuthToken: string;
  jwtSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  nextPublicAppUrl: string;
  geminiApiKey: string;
  upstashRedisUrl: string;
  upstashRedisToken: string;
  searchPrefixOnly: boolean;
  summaryTemperature: number;
  summaryMaxTokens: number;
  summaryRateLimit: number;
  summaryRateWindow: Duration;
};

let cachedEnv: EnvConfig | null = null;

export function requireEnv(): EnvConfig {
  if (process.env.NODE_ENV === "development") {
    cachedEnv = null;
  }

  if (cachedEnv) {
    return cachedEnv;
  }

  // Load .env.local dynamically in development
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length - 1);
          }
          process.env[key] = value;
        }
      }
    }
  } catch (err) {
    console.error("Failed to load .env.local dynamically:", err);
  }


  const tursoDatabaseUrl = (process.env.TURSO_DATABASE_URL ?? "").trim();
  const tursoAuthToken = (process.env.TURSO_AUTH_TOKEN ?? "").trim();
  const jwtSecret = (process.env.JWT_SECRET ?? "").trim();
  const googleClientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const nextPublicAppUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const geminiApiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const upstashRedisUrl = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim();
  const upstashRedisToken = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  const geminiTestMode = (process.env.GEMINI_TEST_MODE ?? "").trim() === "1";
  const rateLimitTestMode = (process.env.RATE_LIMIT_TEST_MODE ?? "").trim() === "1";

  const missing: string[] = [];
  if (!tursoDatabaseUrl) missing.push("TURSO_DATABASE_URL");
  if (!jwtSecret) missing.push("JWT_SECRET");
  if (!googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!nextPublicAppUrl) missing.push("NEXT_PUBLIC_APP_URL");
  if (!geminiApiKey && !geminiTestMode) missing.push("GEMINI_API_KEY");
  if (!upstashRedisUrl && !rateLimitTestMode) missing.push("UPSTASH_REDIS_REST_URL");
  if (!upstashRedisToken && !rateLimitTestMode) missing.push("UPSTASH_REDIS_REST_TOKEN");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  cachedEnv = {
    tursoDatabaseUrl,
    tursoAuthToken,
    jwtSecret,
    googleClientId,
    googleClientSecret,
    nextPublicAppUrl,
    geminiApiKey,
    upstashRedisUrl,
    upstashRedisToken,
    searchPrefixOnly: (process.env.SEARCH_PREFIX_ONLY ?? "").trim() === "1",
    summaryTemperature: parseNumberOrDefault(process.env.SUMMARY_TEMPERATURE, 0.2),
    summaryMaxTokens: parseNumberOrDefault(process.env.SUMMARY_MAX_TOKENS, 256),
    summaryRateLimit: parseNumberOrDefault(process.env.SUMMARY_RATE_LIMIT, 10),
    summaryRateWindow: parseDurationOrDefault(process.env.SUMMARY_RATE_WINDOW, "1 h")
  };

  return cachedEnv;
}

function parseNumberOrDefault(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDurationOrDefault(value: string | undefined, fallback: Duration): Duration {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  if (/^\d+\s?(ms|s|m|h|d)$/.test(raw)) {
    return raw as Duration;
  }
  return fallback;
}
