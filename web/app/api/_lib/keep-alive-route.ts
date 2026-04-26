import { NextResponse } from "next/server";
import { KeepAliveResult, touchSupabaseStorage, touchUpstashRedis } from "./keep-alive";

export async function handleKeepAlive(): Promise<Response> {
  let storageResult: KeepAliveResult;
  let redisResult: KeepAliveResult;
  try {
    [storageResult, redisResult] = await Promise.all([
      touchSupabaseStorage(),
      touchUpstashRedis()
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "keep-alive failed";
    storageResult = {
      ok: false,
      error: message
    };
    redisResult = {
      ok: false,
      error: message
    };
  }

  const overallOk = storageResult.ok && redisResult.ok;
  const payload: Record<string, unknown> = {
    status: "alive"
  };

  payload.storage = storageResult.ok ? "ok" : "degraded";
  payload.redis = redisResult.ok ? "ok" : "degraded";
  if (!overallOk) {
    payload.error = storageResult.error ?? redisResult.error ?? "keep-alive degraded";
  }
  if (storageResult.bucket) payload.bucket = storageResult.bucket;
  if (storageResult.path) payload.path = storageResult.path;
  if (typeof storageResult.statusCode === "number") payload.storage_status = storageResult.statusCode;
  if (typeof storageResult.durationMs === "number") payload.storage_latency_ms = storageResult.durationMs;
  if (typeof redisResult.statusCode === "number") payload.redis_status = redisResult.statusCode;
  if (typeof redisResult.durationMs === "number") payload.redis_latency_ms = redisResult.durationMs;
  if (!storageResult.ok && storageResult.error) payload.storage_error = storageResult.error;
  if (!redisResult.ok && redisResult.error) payload.redis_error = redisResult.error;

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-keep-alive-storage": storageResult.ok ? "ok" : "degraded",
      "x-keep-alive-redis": redisResult.ok ? "ok" : "degraded"
    }
  });
}
