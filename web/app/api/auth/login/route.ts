import { NextResponse } from "next/server";
import { requireEnv } from "../../_lib/env";
import { randomUUID } from "crypto";

export async function GET(request: Request) {
  try {
    const env = requireEnv();
    const url = new URL(request.url);
    const clientRedirectUri = url.searchParams.get("redirect_uri") || `${env.nextPublicAppUrl}/auth/callback`;

    // CSRF protection: generate a random state token and encode the client redirect URI
    const stateToken = randomUUID();
    const encodedRedirectUri = Buffer.from(clientRedirectUri).toString("base64url");
    const statePayload = `${stateToken}:${encodedRedirectUri}`;

    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", env.googleClientId);
    googleAuthUrl.searchParams.set("redirect_uri", `${env.nextPublicAppUrl}/api/auth/callback/google`);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("access_type", "online");
    googleAuthUrl.searchParams.set("state", statePayload);

    const response = NextResponse.redirect(googleAuthUrl.toString());

    // Set an HTTP-only cookie containing the random state token to verify against on return
    response.cookies.set("oauth_state", stateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || env.nextPublicAppUrl.startsWith("https"),
      sameSite: "lax",
      path: "/",
      maxAge: 5 * 60 // 5 minutes
    });

    return response;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

