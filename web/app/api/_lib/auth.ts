import { jwtVerify } from "jose";
import { ApiError } from "./api-error";
import { requireEnv } from "./env";

export type AuthContext = {
  userId: string;
  token: string;
  email: string;
};

export async function requireAuth(request: Request): Promise<AuthContext> {
  const token = readBearerToken(request);
  if (!token) {
    throw new ApiError(401, "missing authorization bearer token");
  }

  const env = requireEnv();

  try {
    const secret = new TextEncoder().encode(env.jwtSecret);
    const { payload } = await jwtVerify(token, secret);

    const userId = payload.sub;
    const email = payload.email as string;

    if (!userId || !email) {
      throw new ApiError(401, "invalid token payload");
    }

    const { getDb } = await import("@/lib/db");
    const db = getDb();
    await db.execute({
      sql: "INSERT INTO teachers (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING",
      args: [userId, email]
    });

    (request as { __userId?: string }).__userId = userId;

    return {
      userId,
      token,
      email
    };
  } catch (err) {
    throw new ApiError(401, "invalid or expired token", err);
  }
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token.trim();
}
