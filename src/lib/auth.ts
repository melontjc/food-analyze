import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE } from "@/lib/config";

const encoder = new TextEncoder();

function secret() {
  return encoder.encode(env("APP_ENCRYPTION_KEY"));
}

export async function ensureAdminUser() {
  const email = env("ADMIN_EMAIL").toLowerCase();
  const passwordHash = env("ADMIN_PASSWORD_HASH");
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash }
  });
}

export async function login(email: string, password: string) {
  const user = await ensureAdminUser();
  if (email.toLowerCase() !== user.email) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

export async function createSession(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function currentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = typeof payload.userId === "string" ? payload.userId : null;
    if (!userId) return null;
    return prisma.user.findUnique({ where: { id: userId } });
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireApiUser() {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export function isPublicPath(request: NextRequest) {
  return request.nextUrl.pathname === "/login" || request.nextUrl.pathname.startsWith("/api/auth");
}
