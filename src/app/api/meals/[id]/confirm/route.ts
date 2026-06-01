import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  finalKcal: z.number().int().min(0).max(10000),
  notes: z.string().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        grams: z.number().positive().max(5000).nullable()
      })
    )
    .max(30)
    .optional()
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "热量数值不正确" }, { status: 400 });

  const { id } = await context.params;
  const meal = await prisma.mealEntry.findUnique({
    where: { id },
    include: { items: { include: { nutritionSource: true } } }
  });
  if (!meal) return NextResponse.json({ error: "餐食草稿不存在" }, { status: 404 });

  const requestedGrams = new Map(parsed.data.items?.map((item) => [item.id, item.grams]));
  const updatedItems = meal.items.map((item) => {
    if (!requestedGrams.has(item.id)) return item;
    const grams = requestedGrams.get(item.id) ?? null;
    const kcal =
      grams != null && item.nutritionSource
        ? Math.round((item.nutritionSource.kcalPer100g * grams) / 100)
        : grams != null && item.grams
          ? Math.round((item.kcal * grams) / item.grams)
          : item.kcal;
    return { ...item, grams, kcal };
  });
  const recalculatedTotal = updatedItems.reduce((total, item) => total + item.kcal, 0);

  await prisma.$transaction([
    ...updatedItems.map((item) =>
      prisma.mealItem.update({
        where: { id: item.id },
        data: { grams: item.grams, kcal: item.kcal }
      })
    ),
    prisma.mealEntry.update({
      where: { id },
      data: {
        status: "confirmed",
        finalKcal: parsed.data.finalKcal,
        modelKcal: parsed.data.items ? recalculatedTotal : meal.modelKcal,
        notes: parsed.data.notes || null
      }
    })
  ]);

  const entry = await prisma.mealEntry.findUnique({
    where: { id },
    include: { items: { include: { nutritionSource: true } } }
  });
  return NextResponse.json({ entry });
}
