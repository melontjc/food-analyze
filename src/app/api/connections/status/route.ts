import { NextResponse } from "next/server";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { getConnection, getIntervalsConfig, OuraTokenData } from "@/lib/connections";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const [oura, intervals] = await Promise.all([getConnection<OuraTokenData>("oura"), getIntervalsConfig()]);
  return NextResponse.json({
    oura: {
      connected: Boolean(oura?.accessToken),
      scope: oura?.scope || null,
      expiresAt: oura?.expiresAt || null
    },
    intervals: {
      connected: Boolean(intervals?.apiKey),
      athleteId: intervals?.athleteId || "0"
    }
  });
}
