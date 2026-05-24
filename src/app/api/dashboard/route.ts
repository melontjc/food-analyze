import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";
import { isDateKey, todayKey } from "@/lib/date";
import { maybeRefreshDashboardData } from "@/lib/sync";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const dateKey = request.nextUrl.searchParams.get("date") || todayKey();
  if (!isDateKey(dateKey)) return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
  await maybeRefreshDashboardData(dateKey);
  return NextResponse.json(await getDashboard(dateKey));
}
