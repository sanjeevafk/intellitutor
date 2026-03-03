import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ApiError } from "./api-error";
import { requireEnv } from "./env";

let limiter: Ratelimit | null = null;

export function getRatelimit(): Ratelimit {
  if (limiter) {
    return limiter;
  }

  const env = requireEnv();

  const redis = new Redis({
    url: env.upstashRedisUrl,
    token: env.upstashRedisToken
  });

  limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(env.summaryRateLimit, env.summaryRateWindow),
    prefix: "rate"
  });

  return limiter;
}

export async function enforceRateLimit(key: string) {
  if (process.env.RATE_LIMIT_TEST_MODE === "1") {
    const env = requireEnv();
    return {
      success: true,
      limit: env.summaryRateLimit,
      remaining: env.summaryRateLimit,
      reset: Math.floor(Date.now() / 1000) + 3600
    };
  }

  const result = await getRatelimit().limit(key);
  if (!result.success) {
    throw new ApiError(429, "rate limit exceeded", {
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset
    });
  }

  return result;
}
