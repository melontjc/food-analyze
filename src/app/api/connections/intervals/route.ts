import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { getIntervalsConfig, saveConnection } from "@/lib/connections";

const schema = z.object({
  apiKey: z.string().min(6),
  athleteId: z.string().min(1).default("0")
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const config = await getIntervalsConfig();
  return NextResponse.json({
    connected: Boolean(config?.apiKey),
    athleteId: config?.athleteId || "0"
  });
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Intervals.icu API Key 不正确" }, { status: 400 });
  await saveConnection("intervals", parsed.data);
  return NextResponse.json({ ok: true });
}
