import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, login, setSessionCookie } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });

  const user = await login(parsed.data.email, parsed.data.password);
  if (!user) return NextResponse.json({ error: "邮箱或密码不正确" }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, await createSession(user.id));
  return response;
}
