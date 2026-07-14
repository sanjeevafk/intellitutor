import { NextResponse } from "next/server";
import { requireEnv } from "../../_lib/env";

export async function GET(request: Request) {
  try {
    const env = requireEnv();
    const url = new URL(request.url);
    const clientRedirectUri = url.searchParams.get("redirect_uri") || `${env.nextPublicAppUrl}/auth/callback`;

    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", env.googleClientId);
    googleAuthUrl.searchParams.set("redirect_uri", `${env.nextPublicAppUrl}/api/auth/callback/google`);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("access_type", "online");
    googleAuthUrl.searchParams.set("state", clientRedirectUri);

    return NextResponse.redirect(googleAuthUrl.toString());
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
