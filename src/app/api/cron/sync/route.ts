import { NextRequest, NextResponse } from "next/server";
import { optionalEnv } from "@/lib/config";
import { todayKey } from "@/lib/date";
import { syncRecentDays } from "@/lib/sync";

export async function GET(request: NextRequest) {
  const cronSecret = optionalEnv("CRON_SECRET");
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await syncRecentDays(todayKey()));
}
