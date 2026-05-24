import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { isDateKey } from "@/lib/date";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  dateKey: z.string().refine((value) => isDateKey(value), "日期格式不正确"),
  weightKg: z.number().min(20).max(300),
  note: z.string().max(500).optional().nullable()
});

export async function PUT(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "体重数据不正确" }, { status: 400 });

  const entry = await prisma.weightEntry.upsert({
    where: { dateKey: parsed.data.dateKey },
    update: {
      weightKg: parsed.data.weightKg,
      note: parsed.data.note || null
    },
    create: {
      dateKey: parsed.data.dateKey,
      weightKg: parsed.data.weightKg,
      note: parsed.data.note || null
    }
  });

  return NextResponse.json({ entry });
}
