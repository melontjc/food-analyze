import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { isDateKey, todayKey } from "@/lib/date";
import { syncRecentDays } from "@/lib/sync";

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const dateKey = typeof body.dateKey === "string" && isDateKey(body.dateKey) ? body.dateKey : todayKey();
  return NextResponse.json(await syncRecentDays(dateKey));
}
