import { NextResponse } from "next/server";
import { touchSupabaseStorage } from "./keep-alive";

export async function handleKeepAlive(): Promise<Response> {
  let result: Awaited<ReturnType<typeof touchSupabaseStorage>>;
  try {
    result = await touchSupabaseStorage();
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : "storage touch failed"
    };
  }

  const payload: Record<string, unknown> = {
    status: "alive"
  };

  if (!result.ok) {
    payload.storage = "degraded";
    payload.error = result.error ?? "storage touch failed";
  }
  if (result.bucket) payload.bucket = result.bucket;
  if (result.path) payload.path = result.path;
  if (typeof result.statusCode === "number") payload.storage_status = result.statusCode;
  if (typeof result.durationMs === "number") payload.storage_latency_ms = result.durationMs;

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-keep-alive-storage": result.ok ? "ok" : "degraded"
    }
  });
}
