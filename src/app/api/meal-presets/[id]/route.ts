import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  portion: z.string().max(120).optional().nullable(),
  defaultGrams: z.number().positive().max(5000).optional().nullable(),
  kcal: z.number().int().min(0).max(10000),
  confidence: z.number().min(0).max(1).optional().nullable(),
  calculationSource: z.string().max(40).optional().nullable(),
  nutritionSourceId: z.string().optional().nullable()
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(1000).optional().nullable(),
  items: z.array(itemSchema).min(1).max(30)
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "常用餐食信息不正确" }, { status: 400 });

  const { id } = await context.params;
  const preset = await prisma.$transaction(async (transaction) => {
    await transaction.mealPresetItem.deleteMany({ where: { presetId: id } });
    return transaction.mealPreset.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        baseKcal: parsed.data.items.reduce((total, item) => total + item.kcal, 0),
        items: { create: parsed.data.items }
      },
      include: { items: { include: { nutritionSource: true } } }
    });
  });
  return NextResponse.json({ preset });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const { id } = await context.params;
  await prisma.mealPreset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
