export type KeepAliveResult = {
  ok: boolean;
  bucket?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: string;
};

type KeepAliveConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  bucket: string;
  objectPath: string;
  timeoutMs: number;
};

type RedisKeepAliveConfig = {
  upstashUrl: string;
  upstashToken: string;
  timeoutMs: number;
};

let cachedConfig: KeepAliveConfig | null = null;
let cachedRedisConfig: RedisKeepAliveConfig | null = null;

export async function touchSupabaseStorage(): Promise<KeepAliveResult> {
  const config = getKeepAliveConfig();
  if (!config.ok) {
    return {
      ok: false,
      error: config.error
    };
  }

  const requestUrl = buildPublicObjectUrl(config.value.supabaseUrl, config.value.bucket, config.value.objectPath);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.value.timeoutMs);

  try {
    const response = await fetch(requestUrl, {
      method: "HEAD",
      headers: {
        apikey: config.value.supabaseAnonKey,
        Authorization: `Bearer ${config.value.supabaseAnonKey}`
      },
      cache: "no-store",
      signal: controller.signal
    });

    const statusCode = response.status;
    const durationMs = Date.now() - startedAt;
    const touched = response.ok || statusCode === 404;

    return {
      ok: touched,
      bucket: config.value.bucket,
      path: config.value.objectPath,
      statusCode,
      durationMs,
      error: touched ? undefined : `storage responded with status ${statusCode}`
    };
  } catch (error) {
    return {
      ok: false,
      bucket: config.value.bucket,
      path: config.value.objectPath,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "storage request failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function touchUpstashRedis(): Promise<KeepAliveResult> {
  const config = getRedisKeepAliveConfig();
  if (!config.ok) {
    return {
      ok: false,
      error: config.error
    };
  }

  const requestUrl = `${config.value.upstashUrl.replace(/\/+$/, "")}/ping`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.value.timeoutMs);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.value.upstashToken}`
      },
      cache: "no-store",
      signal: controller.signal
    });

    const statusCode = response.status;
    const durationMs = Date.now() - startedAt;
    const ok = response.ok;

    return {
      ok,
      statusCode,
      durationMs,
      error: ok ? undefined : `upstash responded with status ${statusCode}`
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "upstash request failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getKeepAliveConfig(): { ok: true; value: KeepAliveConfig } | { ok: false; error: string } {
  if (cachedConfig) {
    return { ok: true, value: cachedConfig };
  }

  const supabaseUrlRaw = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const bucket = (process.env.KEEP_ALIVE_STORAGE_BUCKET ?? "").trim();
  const objectPath = (process.env.KEEP_ALIVE_STORAGE_PATH ?? "").trim();
  const timeoutMsRaw = (process.env.KEEP_ALIVE_TIMEOUT_MS ?? "").trim();
  const timeoutMs = Number.parseInt(timeoutMsRaw, 10);

  const missing: string[] = [];
  if (!supabaseUrlRaw) missing.push("SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
  if (!bucket) missing.push("KEEP_ALIVE_STORAGE_BUCKET");
  if (!objectPath) missing.push("KEEP_ALIVE_STORAGE_PATH");

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required keep-alive env vars: ${missing.join(", ")}`
    };
  }

  cachedConfig = {
    supabaseUrl: normalizeSupabaseUrl(supabaseUrlRaw),
    supabaseAnonKey,
    bucket,
    objectPath: objectPath.replace(/^\/+/, ""),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 800
  };

  return { ok: true, value: cachedConfig };
}

function getRedisKeepAliveConfig(): { ok: true; value: RedisKeepAliveConfig } | { ok: false; error: string } {
  if (cachedRedisConfig) {
    return { ok: true, value: cachedRedisConfig };
  }

  const upstashUrl = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim();
  const upstashToken = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  const timeoutMsRaw = (process.env.KEEP_ALIVE_REDIS_TIMEOUT_MS ?? "").trim();
  const timeoutMs = Number.parseInt(timeoutMsRaw, 10);

  const missing: string[] = [];
  if (!upstashUrl) missing.push("UPSTASH_REDIS_REST_URL");
  if (!upstashToken) missing.push("UPSTASH_REDIS_REST_TOKEN");

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required redis keep-alive env vars: ${missing.join(", ")}`
    };
  }

  cachedRedisConfig = {
    upstashUrl,
    upstashToken,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 600
  };

  return { ok: true, value: cachedRedisConfig };
}

function normalizeSupabaseUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, "");
  if (url.endsWith("/auth/v1")) {
    url = url.slice(0, -"/auth/v1".length);
  }
  return url;
}

function buildPublicObjectUrl(supabaseUrl: string, bucket: string, objectPath: string): string {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = objectPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${supabaseUrl}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}
