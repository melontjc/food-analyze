import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  const entry = await prisma.mealEntry.update({ where: { id }, data: { status: "deleted" } });
  return NextResponse.json({ entry });
}
