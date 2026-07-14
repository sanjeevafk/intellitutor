import { NextResponse } from "next/server";
import { requireEnv } from "../../../_lib/env";
import { getDb } from "../../../../../lib/db";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";

export async function GET(request: Request) {
  const env = requireEnv();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || `${env.nextPublicAppUrl}/auth/callback`;

  if (!code) {
    return NextResponse.redirect(`${env.nextPublicAppUrl}/login?error=no_authorization_code`);
  }

  try {
    // 1. Exchange auth code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: `${env.nextPublicAppUrl}/api/auth/callback/google`,
        grant_type: "authorization_code"
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error("Token exchange failed:", errorData);
      return NextResponse.redirect(`${env.nextPublicAppUrl}/login?error=token_exchange_failed`);
    }

    const { access_token } = await tokenResponse.json();

    // 2. Fetch user profile info
    const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    if (!userinfoResponse.ok) {
      return NextResponse.redirect(`${env.nextPublicAppUrl}/login?error=failed_to_fetch_user_profile`);
    }

    const userInfo = await userinfoResponse.json();
    const email = userInfo.email;

    if (!email) {
      return NextResponse.redirect(`${env.nextPublicAppUrl}/login?error=no_email_provided_by_google`);
    }

    // 3. Connect to Turso SQLite and find/create the teacher
    const db = getDb();
    const existing = await db.execute({
      sql: "SELECT id FROM teachers WHERE email = ?",
      args: [email]
    });

    let teacherId = "";
    if (existing.rows.length > 0) {
      teacherId = existing.rows[0].id as string;
    } else {
      teacherId = randomUUID();
      await db.execute({
        sql: "INSERT INTO teachers (id, email) VALUES (?, ?)",
        args: [teacherId, email]
      });
    }

    // 4. Sign our custom JWT session token
    const secret = new TextEncoder().encode(env.jwtSecret);
    const customToken = await new SignJWT({ email, sub: teacherId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    // 5. Redirect back to frontend
    const redirectUrl = new URL(state);
    redirectUrl.searchParams.set("token", customToken);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(`${env.nextPublicAppUrl}/login?error=authentication_exception`);
  }
}
