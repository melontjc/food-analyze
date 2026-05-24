import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config";
import { saveConnection } from "@/lib/connections";
import { ouraRedirectUri } from "@/lib/oura";

const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("oura_oauth_state")?.value;
  const settingsUrl = new URL("/settings", request.url);
  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("oura", "failed");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = ouraRedirectUri();
  const credentials = Buffer.from(`${env("OURA_CLIENT_ID")}:${env("OURA_CLIENT_SECRET")}`).toString("base64");
  const response = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  if (!response.ok) {
    settingsUrl.searchParams.set("oura", "failed");
    return NextResponse.redirect(settingsUrl);
  }
  const token = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    scope?: string;
  };
  await saveConnection("oura", {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (token.expires_in || 86400) * 1000,
    scope: token.scope
  });
  const okUrl = new URL("/settings?oura=connected", request.url);
  const redirect = NextResponse.redirect(okUrl);
  redirect.cookies.set("oura_oauth_state", "", { maxAge: 0, path: "/" });
  return redirect;
}
