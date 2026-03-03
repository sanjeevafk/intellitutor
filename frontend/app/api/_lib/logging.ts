type LogPayload = {
  requestId: string;
  userId: string | null;
  route: string;
  method: string;
  status: number;
  latencyMs: number;
  error?: unknown;
};

export function logRequest(payload: LogPayload) {
  const event = {
    timestamp: new Date().toISOString(),
    request_id: payload.requestId,
    user_id: payload.userId,
    route: payload.route,
    method: payload.method,
    status: payload.status,
    latency_ms: payload.latencyMs,
    error: payload.error ?? null
  };

  console.log(JSON.stringify(event));
}
