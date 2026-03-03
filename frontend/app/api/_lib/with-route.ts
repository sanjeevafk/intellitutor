import { NextResponse } from "next/server";
import { ApiError } from "./api-error";
import { requireEnv } from "./env";
import { logRequest } from "./logging";

type HandlerContext = {
  request: Request;
  params?: Record<string, string>;
  requestId: string;
};

type HandlerResult = Promise<Response>;

type Handler = (context: HandlerContext) => HandlerResult;

type NextHandler = (request: Request, context?: { params?: Record<string, string> }) => HandlerResult;

export function withRoute(handler: Handler): NextHandler {
  return async (request, context) => {
    const start = Date.now();
    const route = new URL(request.url).pathname;
    const method = request.method;
    const requestId = getRequestId(request);
    let userId: string | null = (request as { __userId?: string }).__userId ?? null;

    try {
      requireEnv();
      const response = await handler({
        request,
        params: context?.params,
        requestId
      });
      const status = response.status;

      const derivedUser = response.headers.get("x-user-id");
      if (derivedUser) {
        userId = derivedUser;
      }

      logRequest({
        requestId,
        userId,
        route,
        method,
        status,
        latencyMs: Date.now() - start
      });

      response.headers.set("x-request-id", requestId);
      response.headers.delete("x-user-id");
      return response;
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "internal server error";

      logRequest({
        requestId,
        userId,
        route,
        method,
        status,
        latencyMs: Date.now() - start,
        error: error instanceof ApiError
          ? error.details ?? message
          : error instanceof Error
            ? error.message
            : message
      });

      const body: Record<string, unknown> = {
        error: message,
        request_id: requestId
      };

      const headers: Record<string, string> = {
        "x-request-id": requestId
      };

      if (status === 429 && error instanceof ApiError && error.details && typeof error.details === "object") {
        body.rate_limit = error.details;
        const reset = (error.details as { reset?: number }).reset;
        if (typeof reset === "number") {
          const retryAfter = Math.max(0, Math.ceil(reset - Date.now() / 1000));
          headers["retry-after"] = retryAfter.toString();
        }
      }

      return NextResponse.json(body, {
        status,
        headers
      });
    }
  };
}

export function getRequestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}
