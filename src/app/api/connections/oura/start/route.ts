import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { ouraRedirectUri } from "@/lib/oura";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const state = crypto.randomBytes(16).toString("base64url");
  const redirectUri = ouraRedirectUri();
  const url = new URL("https://cloud.ouraring.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env("OURA_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "daily");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set("oura_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/"
  });
  return response;
}
