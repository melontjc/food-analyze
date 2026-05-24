import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  finalKcal: z.number().int().min(0).max(10000),
  notes: z.string().max(1000).optional().nullable()
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "热量数值不正确" }, { status: 400 });

  const { id } = await context.params;
  const entry = await prisma.mealEntry.update({
    where: { id },
    data: {
      status: "confirmed",
      finalKcal: parsed.data.finalKcal,
      notes: parsed.data.notes || null
    },
    include: { items: true }
  });
  return NextResponse.json({ entry });
}
